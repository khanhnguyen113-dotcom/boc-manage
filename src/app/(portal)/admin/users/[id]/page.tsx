import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert, ButtonLink, PageHeader } from '@/components/ui/primitives';
import { ROLE_LABELS } from '@/domain/catalogs';
import { requireCapability } from '@/server/auth/current-user';
import { listUnits } from '@/server/repositories/catalogs';
import { getUserAdminRecord } from '@/server/services/users';

import { UserAccountForms } from './user-account-forms';

export const metadata: Metadata = { title: 'Quản lý tài khoản' };

export default async function UserAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireCapability('user.manage');
  if (!currentUser.actor.roles.includes('system_admin')) {
    return (
      <Alert tone="warning" title="Chỉ super admin được quản lý tài khoản">
        Bạn có thể xem danh sách người dùng nhưng không được sửa quyền, đổi mật khẩu hoặc xóa tài khoản.
      </Alert>
    );
  }

  const { id } = await params;
  const [record, units] = await Promise.all([getUserAdminRecord(id), listUnits()]);
  if (!record) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={record.profile.full_name}
        description={`${record.profile.email} · ${ROLE_LABELS[record.role]}`}
        actions={<ButtonLink href="/admin/users" variant="ghost" size="sm">← Danh sách tài khoản</ButtonLink>}
      />
      <UserAccountForms
        profile={record.profile}
        role={record.role}
        scopeType={record.scope?.scope_type === 'CUSTOM' ? 'SELF_ASSIGNED' : (record.scope?.scope_type ?? 'SELF_ASSIGNED')}
        scopeUnitId={record.scope?.unit_id ?? null}
        units={units.filter((unit) => unit.is_active).map((unit) => ({ value: unit.id, label: unit.name }))}
        isSelf={record.profile.user_id === currentUser.actor.user_id}
      />
      <p className="text-center text-[11px] text-[var(--text-subtle)]">
        Mọi thay đổi nhạy cảm đều được ghi vào audit log. <Link href="/admin/audit" className="underline">Xem audit log</Link>
      </p>
    </div>
  );
}
