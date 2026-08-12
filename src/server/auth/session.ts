import 'server-only';

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { env } from '@/config/env';

/**
 * Phiên đăng nhập SSR — guideline 14.3.
 *
 * Cookie là HTTP-only, `Secure` ở production, `SameSite=Lax`, ký HMAC-SHA256 để không sửa được
 * từ phía client. Nội dung cookie **không** chứa vai trò hay quyền: mọi quyền được nạp lại từ
 * server ở từng request (guideline 4.2 — thu hồi quyền có hiệu lực ngay request kế tiếp).
 */

export interface SessionPayload {
  /** `profiles.user_id`. */
  uid: string;
  /** Session secret của Appwrite khi chạy driver `appwrite`. */
  aws?: string;
  /** Hết hạn, epoch giây. */
  exp: number;
}

function sign(data: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(data).digest('base64url');
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = sign(body);
  // So sánh chống timing attack; độ dài khác nhau ⇒ chữ ký sai.
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decodeSession(store.get(env().SESSION_COOKIE_NAME)?.value);
}

export async function writeSession(payload: Omit<SessionPayload, 'exp'>): Promise<void> {
  const e = env();
  const maxAge = e.SESSION_MAX_AGE_SECONDS;
  const token = encodeSession({ ...payload, exp: Math.floor(Date.now() / 1000) + maxAge });

  const store = await cookies();
  store.set(e.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: e.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(env().SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

// ---------------------------------------------------------------------------
// Băm mật khẩu cho driver local
// ---------------------------------------------------------------------------
// Driver `appwrite` KHÔNG dùng những hàm này — Appwrite Auth tự quản lý mật khẩu.

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}
