import 'server-only';

import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { Client, Users } from 'node-appwrite';

import { env } from '@/config/env';
import { effectiveCapabilities, hasCapability, resolveScope, type Actor } from '@/domain/permissions';
import type {
  DataScope,
  OrganizationalUnit,
  Profile,
  RoleCode,
  UserCapabilityGrant,
  UserRoleAssignment,
} from '@/domain/types';
import type { CreateUserInput } from '@/schemas/user';

import { installAppwriteDnsOverride } from '../appwrite/dns-override';
import type { SessionUser } from '../auth/current-user';
import { hashPassword } from '../auth/session';
import { getStore, type Row } from '../db/store';
import { listUnits } from '../repositories/catalogs';
import { recordAudit } from './audit';
import { forbidden, validation } from './errors';

/**
 * Dựng `Actor` cho một user bất kỳ (không phải người đang đăng nhập).
 *
 * Dùng khi cần trả lời câu hỏi “người X có được xem việc Y không?” — ví dụ lọc danh sách
 * @mention hoặc người nhận thông báo. Không bao giờ dùng để nâng quyền cho người đang gọi.
 */
export const getSessionUserById = cache(async (userId: string): Promise<SessionUser | null> => {
  const store = await getStore();
  const profiles = await store.all<Row & Profile>('profiles', {
    filters: [{ field: 'user_id', op: 'eq', value: userId }],
    limit: 1,
  });
  const profile = profiles[0];
  if (!profile) return null;

  const [roleRows, scopeRows, capabilityRows, units] = await Promise.all([
    store.all<Row & UserRoleAssignment>('user_roles', {
      filters: [{ field: 'user_id', op: 'eq', value: userId }],
    }),
    store.all<Row & DataScope>('data_scopes', {
      filters: [{ field: 'user_id', op: 'eq', value: userId }],
    }),
    store.all<Row & UserCapabilityGrant>('user_capabilities', {
      filters: [{ field: 'user_id', op: 'eq', value: userId }],
    }),
    listUnits(),
  ]);

  const managed = new Set<string>();
  for (const unit of units) {
    if (unit.manager_user_id === userId) addWithChildren(unit, units, managed);
  }
  for (const scope of scopeRows) {
    if (scope.scope_type === 'UNIT' && scope.unit_id) {
      const unit = units.find((u) => u.id === scope.unit_id);
      if (unit) {
        if (scope.include_children) addWithChildren(unit, units, managed);
        else managed.add(unit.id);
      }
    }
  }

  const actor: Actor = {
    user_id: profile.user_id,
    full_name: profile.full_name,
    is_active: profile.status === 'ACTIVE',
    roles: roleRows.map((r) => r.role_code as RoleCode),
    primary_unit_id: profile.primary_unit_id,
    managed_unit_ids: [...managed],
    scopes: scopeRows.map((s) => ({
      scope_type: s.scope_type,
      unit_id: s.unit_id,
      include_children: s.include_children,
    })),
    granted: capabilityRows.filter((c) => c.effect === 'ALLOW').map((c) => c.capability as never),
    denied: capabilityRows.filter((c) => c.effect === 'DENY').map((c) => c.capability as never),
  };

  return {
    profile,
    actor,
    scope: resolveScope(actor),
    capabilities: effectiveCapabilities(actor),
    unit: units.find((u) => u.id === profile.primary_unit_id) ?? null,
  };
});

function addWithChildren(
  unit: OrganizationalUnit,
  units: OrganizationalUnit[],
  into: Set<string>,
): void {
  if (into.has(unit.id)) return;
  into.add(unit.id);
  for (const child of units.filter((u) => u.parent_id === unit.id)) {
    addWithChildren(child, units, into);
  }
}

/** Vai trò của từng user — dùng ở trang quản trị người dùng. */
export async function listUserRoles(): Promise<Map<string, RoleCode[]>> {
  const store = await getStore();
  const rows = await store.all<Row & UserRoleAssignment>('user_roles');
  const map = new Map<string, RoleCode[]>();
  for (const row of rows) {
    const list = map.get(row.user_id) ?? [];
    list.push(row.role_code as RoleCode);
    map.set(row.user_id, list);
  }
  return map;
}

const PRIVILEGED_ROLES = new Set<RoleCode>(['system_admin', 'boc_director']);

/** Tạo đồng thời tài khoản Auth, hồ sơ, vai trò và phạm vi dữ liệu. */
export async function createUserAccount(
  actor: SessionUser,
  input: CreateUserInput,
): Promise<{ userId: string }> {
  if (!hasCapability(actor.actor, 'user.manage')) throw forbidden();
  if (PRIVILEGED_ROLES.has(input.role_code) && !hasCapability(actor.actor, 'permission.manage')) {
    throw forbidden('Chỉ super admin có quyền tạo tài khoản quản trị cấp cao.');
  }

  const store = await getStore();
  const existing = await store.all<Row & Profile>('profiles', {
    filters: [{ field: 'email', op: 'eq', value: input.email }],
    limit: 1,
  });
  if (existing.length > 0) throw validation('Email này đã tồn tại trong hệ thống.');

  const userId = randomUUID();
  const profileId = randomUUID();
  const roleId = randomUUID();
  const scopeId = randomUUID();
  const createdRows: { table: 'profiles' | 'user_roles' | 'data_scopes'; id: string }[] = [];
  let authCreated = false;

  const scopeType = PRIVILEGED_ROLES.has(input.role_code) ? 'ALL' : input.scope_type;
  const scopeUnitId = scopeType === 'UNIT' ? input.scope_unit_id : null;

  try {
    if (env().DATA_DRIVER === 'appwrite') {
      await appwriteUsers().create({
        userId,
        email: input.email,
        password: input.password,
        name: input.full_name,
      });
      authCreated = true;
    }

    await store.insert('profiles', {
      id: profileId,
      user_id: userId,
      employee_code: input.employee_code,
      full_name: input.full_name,
      display_alias: null,
      email: input.email,
      primary_unit_id: input.primary_unit_id,
      job_title: input.job_title,
      avatar_color: 'brand',
      status: 'ACTIVE',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      capacity_hours_per_day: input.capacity_hours_per_day,
      password_hash: env().DATA_DRIVER === 'local' ? hashPassword(input.password) : null,
      last_seen_at: null,
    } as never);
    createdRows.push({ table: 'profiles', id: profileId });

    await store.insert('user_roles', {
      id: roleId,
      user_id: userId,
      role_code: input.role_code,
      unit_id: input.primary_unit_id,
      valid_from: null,
      valid_to: null,
    } as never);
    createdRows.push({ table: 'user_roles', id: roleId });

    await store.insert('data_scopes', {
      id: scopeId,
      user_id: userId,
      scope_type: scopeType,
      unit_id: scopeUnitId,
      include_children: true,
      valid_to: null,
    } as never);
    createdRows.push({ table: 'data_scopes', id: scopeId });

    await recordAudit({
      store,
      actorUserId: actor.actor.user_id,
      action: 'user.create',
      entityType: 'user',
      entityId: userId,
      after: { ...input, password: '[redacted]', scope_type: scopeType, scope_unit_id: scopeUnitId },
      changedFields: ['profile', 'role', 'scope'],
    });

    return { userId };
  } catch (error) {
    for (const row of createdRows.reverse()) {
      try {
        await store.delete(row.table, row.id);
      } catch {
        // Best-effort compensation; lỗi gốc vẫn được trả về cho quản trị viên.
      }
    }
    if (authCreated) {
      try {
        await appwriteUsers().delete({ userId });
      } catch {
        // Best-effort compensation.
      }
    }
    throw error;
  }
}

function appwriteUsers(): Users {
  const e = env();
  installAppwriteDnsOverride();
  return new Users(
    new Client()
      .setEndpoint(e.APPWRITE_ENDPOINT!)
      .setProject(e.APPWRITE_PROJECT_ID!)
      .setKey(e.APPWRITE_SERVER_API_KEY!),
  );
}
