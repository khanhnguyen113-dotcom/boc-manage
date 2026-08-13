import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { TableShell, Td, Th, Tr } from '@/components/ui/table';
import { ROLE_LABELS } from '@/domain/catalogs';
import { ROLE_BASELINE } from '@/domain/permissions';
import { formatDateTime, formatHours, initials } from '@/lib/format';
import { requireCapability } from '@/server/auth/current-user';
import { listProfiles, unitMap } from '@/server/repositories/catalogs';
import { listUserRoles } from '@/server/services/users';
import { CreateUserForm } from './create-user-form';

export const metadata: Metadata = { title: 'Người dùng & phân quyền' };

export default async function AdminUsersPage() {
  const currentUser = await requireCapability('user.manage');

  const [profiles, roles, units] = await Promise.all([listProfiles(), listUserRoles(), unitMap()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Người dùng & phân quyền"
        description="Vai trò quyết định capability; phạm vi dữ liệu quyết định người đó nhìn thấy bản ghi nào. Hai thứ này độc lập nhau."
      />

      <Card>
        <CardHeader
          title="Tạo người dùng mới"
          description="Tài khoản được tạo đồng thời trong Appwrite Auth và dữ liệu phân quyền của BOC. Super admin có thể tạo mọi vai trò."
        />
        <CreateUserForm
          units={[...units.values()].map((unit) => ({ value: unit.id, label: unit.name }))}
          canManagePrivileged={currentUser.capabilities.has('permission.manage')}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title={`Danh sách người dùng (${profiles.length})`}
          description="Người dùng bị khóa mất toàn bộ quyền ngay ở request kế tiếp, không cần chờ hết phiên."
        />
        <TableShell caption="Danh sách người dùng và vai trò">
          <thead>
            <tr>
              <Th sticky>Họ tên</Th>
              <Th>Email</Th>
              <Th>Đơn vị</Th>
              <Th>Vai trò</Th>
              <Th align="right">Công suất</Th>
              <Th>Trạng thái</Th>
              <Th>Truy cập gần nhất</Th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const userRoles = roles.get(profile.user_id) ?? [];
              return (
                <Tr key={profile.id}>
                  <Td sticky>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="flex size-7 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[10px] font-semibold"
                      >
                        {initials(profile.full_name)}
                      </span>
                      <span>
                        <span className="block text-sm">{profile.full_name}</span>
                        {profile.display_alias ? (
                          <span className="block text-[11px] text-[var(--text-subtle)]">
                            Sheet: {profile.display_alias}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Td>
                  <Td className="text-xs text-[var(--text-muted)]">{profile.email}</Td>
                  <Td className="text-xs text-[var(--text-muted)]">
                    {profile.primary_unit_id ? (units.get(profile.primary_unit_id)?.name ?? '—') : '—'}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {userRoles.map((role) => (
                        <Badge key={role} tone="strategic" title={`${ROLE_BASELINE[role]?.length ?? 0} capability`}>
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))}
                      {userRoles.length === 0 ? (
                        <Badge tone="warning">Chưa gán vai trò</Badge>
                      ) : null}
                    </span>
                  </Td>
                  <Td align="right" className="text-xs">
                    {formatHours(profile.capacity_hours_per_day)}
                  </Td>
                  <Td>
                    <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {profile.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-[var(--text-muted)]">
                    {formatDateTime(profile.last_seen_at)}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>

      <Card>
        <CardHeader
          title="Ma trận vai trò → capability"
          description="Baseline theo guideline mục 4.4. Capability cấp riêng cho từng người sẽ cộng thêm hoặc thu hồi trên nền này."
        />
        <div className="overflow-x-auto p-5">
          <ul className="space-y-3 text-sm">
            {Object.entries(ROLE_BASELINE).map(([role, capabilities]) => (
              <li key={role}>
                <p className="font-medium">
                  {ROLE_LABELS[role as keyof typeof ROLE_LABELS]}{' '}
                  <span className="text-[11px] font-normal text-[var(--text-subtle)]">
                    ({capabilities.length} capability)
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {capabilities.join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-[var(--text-muted)]">
            <strong>Quản trị hệ thống</strong> là super admin, có toàn bộ capability và phạm vi dữ liệu toàn BOC.{' '}
            <Link href="/profile" className="underline">
              Xem quyền hiệu lực của chính bạn
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
