import 'server-only';

import { cache } from 'react';

import { effectiveCapabilities, resolveScope, type Actor } from '@/domain/permissions';
import type {
  DataScope,
  OrganizationalUnit,
  Profile,
  RoleCode,
  UserCapabilityGrant,
  UserRoleAssignment,
} from '@/domain/types';

import type { SessionUser } from '../auth/current-user';
import { getStore, type Row } from '../db/store';
import { listUnits } from '../repositories/catalogs';

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
