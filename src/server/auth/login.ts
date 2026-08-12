import 'server-only';

import { Account, Client } from 'node-appwrite';

import { env } from '@/config/env';
import type { Profile } from '@/domain/types';

import { installAppwriteDnsOverride } from '../appwrite/dns-override';
import { getStore, type Row } from '../db/store';
import { recordAudit } from '../services/audit';
import { clearSession, verifyPassword, writeSession } from './session';
import { readSession } from './session';

export type LoginResult = { ok: true } | { ok: false; message: string };

/**
 * Đăng nhập bằng email + mật khẩu.
 *
 * - `DATA_DRIVER=appwrite`: tạo session phía server bằng Appwrite Auth, lưu secret vào cookie
 *   HTTP-only (guideline 14.3). Không có mật khẩu nào được lưu trong ứng dụng này.
 * - `DATA_DRIVER=local`  : đối chiếu scrypt hash trong `profiles.password_hash` (chỉ dev).
 *
 * Thông báo lỗi cố tình mơ hồ như nhau cho mọi trường hợp để không lộ email nào tồn tại.
 */
const GENERIC_ERROR = 'Email hoặc mật khẩu không đúng.';

export async function login(email: string, password: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return { ok: false, message: GENERIC_ERROR };

  const store = await getStore();
  const profiles = await store.all<Row & Profile>('profiles', {
    filters: [{ field: 'email', op: 'eq', value: normalizedEmail }],
    limit: 1,
  });
  const profile = profiles[0];

  if (!profile) return { ok: false, message: GENERIC_ERROR };

  if (profile.status !== 'ACTIVE') {
    return { ok: false, message: 'Tài khoản đang bị khóa. Liên hệ quản trị hệ thống.' };
  }

  if (env().DATA_DRIVER === 'appwrite') {
    installAppwriteDnsOverride();
    const client = new Client()
      .setEndpoint(env().APPWRITE_ENDPOINT!)
      .setProject(env().APPWRITE_PROJECT_ID!);
    const account = new Account(client);
    try {
      const session = await account.createEmailPasswordSession({
        email: normalizedEmail,
        password,
      });
      await writeSession({ uid: profile.user_id, aws: session.secret });
    } catch {
      return { ok: false, message: GENERIC_ERROR };
    }
  } else {
    const record = profile as Profile & { password_hash?: string };
    if (!verifyPassword(password, record.password_hash)) {
      return { ok: false, message: GENERIC_ERROR };
    }
    await writeSession({ uid: profile.user_id });
  }

  await store.update('profiles', profile.id, { last_seen_at: new Date().toISOString() });
  await recordAudit({
    actorUserId: profile.user_id,
    action: 'auth.login',
    entityType: 'profile',
    entityId: profile.id,
    changedFields: [],
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const session = await readSession();

  if (session?.aws && env().DATA_DRIVER === 'appwrite') {
    try {
      installAppwriteDnsOverride();
      const client = new Client()
        .setEndpoint(env().APPWRITE_ENDPOINT!)
        .setProject(env().APPWRITE_PROJECT_ID!)
        .setSession(session.aws);
      await new Account(client).deleteSession({ sessionId: 'current' });
    } catch {
      // Session phía Appwrite có thể đã hết hạn — vẫn xóa cookie phía ứng dụng.
    }
  }

  if (session?.uid) {
    await recordAudit({
      actorUserId: session.uid,
      action: 'auth.logout',
      entityType: 'profile',
      entityId: session.uid,
      changedFields: [],
    });
  }

  await clearSession();
}
