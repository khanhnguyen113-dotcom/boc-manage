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
import type { CreateUserInput, UpdateUserInput } from '@/schemas/user';

import { installAppwriteDnsOverride } from '../appwrite/dns-override';
import type { SessionUser } from '../auth/current-user';
import { hashPassword } from '../auth/session';
import { getStore, type Row } from '../db/store';
import type { TableName } from '../db/schema';
import { listUnits } from '../repositories/catalogs';
import { recordAudit } from './audit';
import { forbidden, notFound, validation } from './errors';

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

export async function getUserAdminRecord(userId: string): Promise<{
  profile: Profile;
  role: RoleCode;
  scope: DataScope | null;
} | null> {
  const store = await getStore();
  const [profiles, roles, scopes] = await Promise.all([
    store.all<Row & Profile>('profiles', {
      filters: [{ field: 'user_id', op: 'eq', value: userId }],
      limit: 1,
    }),
    store.all<Row & UserRoleAssignment>('user_roles', {
      filters: [{ field: 'user_id', op: 'eq', value: userId }],
    }),
    store.all<Row & DataScope>('data_scopes', {
      filters: [{ field: 'user_id', op: 'eq', value: userId }],
    }),
  ]);
  if (!profiles[0]) return null;
  return { profile: profiles[0], role: (roles[0]?.role_code ?? 'member') as RoleCode, scope: scopes[0] ?? null };
}

const PRIVILEGED_ROLES = new Set<RoleCode>(['system_admin', 'boc_director']);

/** Tạo đồng thời tài khoản Auth, hồ sơ, vai trò và phạm vi dữ liệu. */
export async function createUserAccount(
  actor: SessionUser,
  input: CreateUserInput,
): Promise<{ userId: string }> {
  if (!hasCapability(actor.actor, 'user.manage')) throw forbidden();
  assertSuperAdmin(actor);
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
      .setKey(e.APPWRITE_API_KEY_AUTH!),
  );
}

function normalizeAppwriteUserError(error: unknown, stage: 'auth' | 'data'): unknown {
  const detail = error as { code?: number; type?: string };
  if (typeof detail.code !== 'number') return error;
  if (detail.code === 404 && stage === 'auth') {
    return notFound('Tài khoản không còn tồn tại trong Appwrite Auth. Hãy đồng bộ lại tài khoản.');
  }
  if (detail.code === 409) {
    return validation('Email này đã được sử dụng bởi tài khoản khác trong Appwrite Auth.');
  }
  if (detail.code === 400) {
    return validation(
      stage === 'auth'
        ? 'Appwrite từ chối thông tin tài khoản hoặc mật khẩu. Hãy kiểm tra định dạng rồi thử lại.'
        : 'Appwrite từ chối dữ liệu hồ sơ, vai trò hoặc phạm vi vừa nhập.',
    );
  }
  if (detail.code === 401 || detail.code === 403) {
    return forbidden(
      stage === 'auth'
        ? 'APPWRITE_API_KEY_AUTH chưa có quyền users.write để sửa tài khoản.'
        : 'APPWRITE_API_KEY_DATA chưa có quyền ghi bảng dữ liệu người dùng.',
    );
  }
  return error;
}

function assertSuperAdmin(actor: SessionUser): void {
  if (!actor.actor.roles.includes('system_admin')) {
    throw forbidden('Chỉ super admin được quản lý, đổi mật khẩu hoặc xóa tài khoản.');
  }
}

export async function updateUserAccount(actor: SessionUser, input: UpdateUserInput): Promise<void> {
  assertSuperAdmin(actor);
  const current = await getUserAdminRecord(input.user_id);
  if (!current) throw notFound('Không tìm thấy tài khoản cần cập nhật.');
  if (input.user_id === actor.actor.user_id && (input.status !== 'ACTIVE' || input.role_code !== 'system_admin')) {
    throw validation('Không thể tự khóa hoặc tự gỡ quyền super admin của tài khoản đang đăng nhập.');
  }

  const store = await getStore();
  const duplicate = await store.all<Row & Profile>('profiles', {
    filters: [{ field: 'email', op: 'eq', value: input.email }],
  });
  if (duplicate.some((profile) => profile.user_id !== input.user_id)) {
    throw validation('Email này đã được tài khoản khác sử dụng.');
  }

  const roleRows = await store.all<Row & UserRoleAssignment>('user_roles', {
    filters: [{ field: 'user_id', op: 'eq', value: input.user_id }],
  });
  const scopeRows = await store.all<Row & DataScope>('data_scopes', {
    filters: [{ field: 'user_id', op: 'eq', value: input.user_id }],
  });
  const privileged = PRIVILEGED_ROLES.has(input.role_code);
  const scopeType = privileged ? 'ALL' : input.scope_type;
  const scopeUnitId = scopeType === 'UNIT' ? input.scope_unit_id : null;
  let authTouched = false;
  let mutationStage: 'auth' | 'data' = 'auth';

  try {
    if (env().DATA_DRIVER === 'appwrite') {
      const auth = appwriteUsers();
      if (input.full_name !== current.profile.full_name) {
        await auth.updateName({ userId: input.user_id, name: input.full_name });
        authTouched = true;
      }
      if (input.email !== current.profile.email) {
        await auth.updateEmail({ userId: input.user_id, email: input.email });
        authTouched = true;
      }
      if ((input.status === 'ACTIVE') !== (current.profile.status === 'ACTIVE')) {
        await auth.updateStatus({ userId: input.user_id, status: input.status === 'ACTIVE' });
        authTouched = true;
      }
    }

    mutationStage = 'data';
    await store.transaction(async (tx) => {
      await tx.update('profiles', current.profile.id, {
        full_name: input.full_name,
        email: input.email,
        employee_code: input.employee_code,
        job_title: input.job_title,
        primary_unit_id: input.primary_unit_id,
        capacity_hours_per_day: input.capacity_hours_per_day,
        status: input.status,
      } as never);
      const rolePayload = {
        user_id: input.user_id,
        role_code: input.role_code,
        unit_id: input.primary_unit_id,
        valid_from: null,
        valid_to: null,
      };
      if (roleRows[0]) await tx.update('user_roles', roleRows[0].id, rolePayload as never);
      else await tx.insert('user_roles', { id: randomUUID(), ...rolePayload } as never);
      for (const row of roleRows.slice(1)) await tx.delete('user_roles', row.id);

      const scopePayload = {
        user_id: input.user_id,
        scope_type: scopeType,
        unit_id: scopeUnitId,
        include_children: true,
        valid_to: null,
      };
      if (scopeRows[0]) await tx.update('data_scopes', scopeRows[0].id, scopePayload as never);
      else await tx.insert('data_scopes', { id: randomUUID(), ...scopePayload } as never);
      for (const row of scopeRows.slice(1)) await tx.delete('data_scopes', row.id);
    });
  } catch (error) {
    if (authTouched && env().DATA_DRIVER === 'appwrite') {
      try {
        const auth = appwriteUsers();
        await auth.updateName({ userId: input.user_id, name: current.profile.full_name });
        await auth.updateEmail({ userId: input.user_id, email: current.profile.email });
        await auth.updateStatus({ userId: input.user_id, status: current.profile.status === 'ACTIVE' });
      } catch {
        // Best-effort bù trừ Appwrite Auth; lỗi gốc vẫn được trả về.
      }
    }
    throw normalizeAppwriteUserError(error, mutationStage);
  }

  await recordAudit({
    actorUserId: actor.actor.user_id,
    action: 'user.update',
    entityType: 'user',
    entityId: input.user_id,
    before: { profile: current.profile, role: current.role, scope: current.scope },
    after: { ...input, scope_type: scopeType, scope_unit_id: scopeUnitId },
    changedFields: ['profile', 'role', 'scope', 'status'],
  });
}

export async function changeUserPassword(
  actor: SessionUser,
  userId: string,
  password: string,
): Promise<{ sessionsRevoked: boolean }> {
  assertSuperAdmin(actor);
  const current = await getUserAdminRecord(userId);
  if (!current) throw notFound('Không tìm thấy tài khoản cần đổi mật khẩu.');

  let sessionsRevoked = true;
  if (env().DATA_DRIVER === 'appwrite') {
    const auth = appwriteUsers();
    try {
      await auth.updatePassword({ userId, password });
    } catch (error) {
      throw normalizeAppwriteUserError(error, 'auth');
    }
    try {
      await auth.deleteSessions({ userId });
    } catch (error) {
      sessionsRevoked = false;
      const detail = error as { code?: number; type?: string };
      console.warn('[user.password.change] Không thể thu hồi phiên Appwrite', {
        code: detail.code,
        type: detail.type,
      });
    }
  } else {
    const store = await getStore();
    await store.update('profiles', current.profile.id, { password_hash: hashPassword(password) } as never);
  }

  await recordAudit({
    actorUserId: actor.actor.user_id,
    action: 'user.password.change',
    entityType: 'user',
    entityId: userId,
    after: { password: '[redacted]', sessions_revoked: sessionsRevoked },
    changedFields: ['password', 'sessions'],
  });
  return { sessionsRevoked };
}

const USER_REFERENCE_CHECKS: {
  table: TableName;
  label: string;
  fields: string[];
}[] = [
  { table: 'work_items', label: 'công việc', fields: ['created_by', 'updated_by', 'lead_user_id', 'primary_assignee_id'] },
  { table: 'work_assignments', label: 'phân công', fields: ['user_id', 'assigned_by'] },
  { table: 'execution_logs', label: 'nhật ký thực hiện', fields: ['responsible_user_id', 'created_by', 'updated_by'] },
  { table: 'comments', label: 'bình luận', fields: ['author_user_id', 'hidden_by', 'mentioned_user_ids'] },
  { table: 'attachments', label: 'tệp đính kèm', fields: ['uploaded_by'] },
  { table: 'organizational_units', label: 'đơn vị quản lý', fields: ['manager_user_id'] },
  { table: 'system_settings', label: 'tham số hệ thống', fields: ['updated_by'] },
  { table: 'audit_logs', label: 'audit log', fields: ['actor_user_id'] },
  { table: 'activity_events', label: 'dòng hoạt động', fields: ['actor_user_id'] },
  { table: 'import_jobs', label: 'phiên import', fields: ['actor_user_id'] },
  { table: 'export_jobs', label: 'phiên export', fields: ['actor_user_id'] },
];

export async function deleteUserAccount(actor: SessionUser, userId: string): Promise<void> {
  assertSuperAdmin(actor);
  if (userId === actor.actor.user_id) throw validation('Không thể tự xóa tài khoản đang đăng nhập.');
  const current = await getUserAdminRecord(userId);
  if (!current) throw notFound('Không tìm thấy tài khoản cần xóa.');
  const store = await getStore();

  const references: string[] = [];
  for (const check of USER_REFERENCE_CHECKS) {
    const rows = await store.all<Row>(check.table);
    const count = rows.filter((row) =>
      check.fields.some((field) => {
        const value = row[field];
        return Array.isArray(value) ? value.includes(userId) : value === userId;
      }),
    ).length;
    if (count > 0) references.push(`${count} ${check.label}`);
  }
  if (references.length > 0) {
    throw validation(
      `Không thể xóa vì tài khoản còn được tham chiếu bởi ${references.join(', ')}. Hãy chuyển trạng thái sang Đã khóa để giữ lịch sử.`,
    );
  }

  const [roles, scopes, grants, notifications, capacities] = await Promise.all([
    store.all<Row & UserRoleAssignment>('user_roles', { filters: [{ field: 'user_id', op: 'eq', value: userId }] }),
    store.all<Row & DataScope>('data_scopes', { filters: [{ field: 'user_id', op: 'eq', value: userId }] }),
    store.all<Row & UserCapabilityGrant>('user_capabilities', { filters: [{ field: 'user_id', op: 'eq', value: userId }] }),
    store.all<Row>('notifications', { filters: [{ field: 'recipient_user_id', op: 'eq', value: userId }] }),
    store.all<Row>('capacity_settings', { filters: [{ field: 'scope_id', op: 'eq', value: userId }] }),
  ]);

  if (env().DATA_DRIVER === 'appwrite') {
    try {
      await appwriteUsers().delete({ userId });
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error;
    }
  }

  await store.transaction(async (tx) => {
    for (const row of notifications) await tx.delete('notifications', row.id);
    for (const row of capacities) await tx.delete('capacity_settings', row.id);
    for (const row of grants) await tx.delete('user_capabilities', row.id);
    for (const row of scopes) await tx.delete('data_scopes', row.id);
    for (const row of roles) await tx.delete('user_roles', row.id);
    await tx.delete('profiles', current.profile.id);
  });

  await recordAudit({
    actorUserId: actor.actor.user_id,
    action: 'user.delete',
    entityType: 'user',
    entityId: userId,
    before: { email: current.profile.email, full_name: current.profile.full_name },
    changedFields: ['auth_user', 'profile', 'roles', 'scopes'],
    reason: 'Super admin xóa tài khoản không còn tham chiếu dữ liệu.',
  });
}
