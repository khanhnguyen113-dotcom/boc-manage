import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import type { Capability, Actor, EffectiveScope } from '@/domain/permissions';
import { effectiveCapabilities, resolveScope } from '@/domain/permissions';
import type {
  DataScope,
  OrganizationalUnit,
  Profile,
  RoleCode,
  UserCapabilityGrant,
  UserRoleAssignment,
} from '@/domain/types';

import { getStore, type Row } from '../db/store';
import { listUnits } from '../repositories/catalogs';
import { readSession } from './session';

/**
 * Danh tính + quyền hiệu lực của người đang gọi.
 *
 * Nạp lại từ store ở **mỗi request** (không cache xuyên request) để việc vô hiệu hóa tài khoản
 * hoặc thu hồi capability có hiệu lực ngay ở request kế tiếp — guideline 4.2.
 */

export interface SessionUser {
  profile: Profile;
  actor: Actor;
  scope: EffectiveScope;
  capabilities: Set<Capability>;
  unit: OrganizationalUnit | null;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const store = await getStore();
  const profiles = await store.all<Row & Profile>('profiles', {
    filters: [{ field: 'user_id', op: 'eq', value: session.uid }],
    limit: 1,
  });
  const profile = profiles[0];
  if (!profile) return null;

  const [roleRows, scopeRows, capabilityRows, units] = await Promise.all([
    store.all<Row & UserRoleAssignment>('user_roles', {
      filters: [{ field: 'user_id', op: 'eq', value: profile.user_id }],
    }),
    store.all<Row & DataScope>('data_scopes', {
      filters: [{ field: 'user_id', op: 'eq', value: profile.user_id }],
    }),
    store.all<Row & UserCapabilityGrant>('user_capabilities', {
      filters: [{ field: 'user_id', op: 'eq', value: profile.user_id }],
    }),
    listUnits(),
  ]);

  const roles = roleRows.map((r) => r.role_code as RoleCode);

  // Đơn vị người này quản lý, kể cả đơn vị con.
  const managedUnitIds = new Set<string>();
  for (const unit of units) {
    if (unit.manager_user_id === profile.user_id) {
      managedUnitIds.add(unit.id);
      collectDescendants(unit.id, units, managedUnitIds);
    }
  }
  for (const scopeRow of scopeRows) {
    if (scopeRow.scope_type === 'UNIT' && scopeRow.unit_id) {
      managedUnitIds.add(scopeRow.unit_id);
      if (scopeRow.include_children) collectDescendants(scopeRow.unit_id, units, managedUnitIds);
    }
  }

  const actor: Actor = {
    user_id: profile.user_id,
    full_name: profile.full_name,
    is_active: profile.status === 'ACTIVE',
    roles,
    primary_unit_id: profile.primary_unit_id,
    managed_unit_ids: [...managedUnitIds],
    scopes: scopeRows.map((s) => ({
      scope_type: s.scope_type,
      unit_id: s.unit_id,
      include_children: s.include_children,
    })),
    granted: capabilityRows
      .filter((c) => c.effect === 'ALLOW' && notExpired(c))
      .map((c) => c.capability as Capability),
    denied: capabilityRows
      .filter((c) => c.effect === 'DENY' && notExpired(c))
      .map((c) => c.capability as Capability),
  };

  return {
    profile,
    actor,
    scope: resolveScope(actor),
    capabilities: effectiveCapabilities(actor),
    unit: units.find((u) => u.id === profile.primary_unit_id) ?? null,
  };
});

function notExpired(grant: UserCapabilityGrant): boolean {
  if (!grant.expires_at) return true;
  return grant.expires_at >= new Date().toISOString().slice(0, 10);
}

function collectDescendants(
  unitId: string,
  units: OrganizationalUnit[],
  into: Set<string>,
): void {
  for (const unit of units) {
    if (unit.parent_id === unitId && !into.has(unit.id)) {
      into.add(unit.id);
      collectDescendants(unit.id, units, into);
    }
  }
}

/** Dùng trong layout/page được bảo vệ. Chuyển hướng về đăng nhập nếu chưa có phiên hợp lệ. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.actor.is_active) redirect('/login?error=inactive');
  return user;
}

export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.capabilities.has(capability)) redirect('/dashboard?denied=' + capability);
  return user;
}
