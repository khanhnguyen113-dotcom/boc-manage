import type { Metadata } from 'next';

import { Badge, Card, CardBody, CardHeader, PageHeader, Stat } from '@/components/ui/primitives';
import { CAPABILITY_LABELS, type Capability } from '@/domain/permissions';
import { ROLE_LABELS } from '@/domain/catalogs';
import { formatDateTime, formatHours } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { getBocContext } from '@/server/services/context';

import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Hồ sơ' };

/**
 * Hồ sơ + quyền hiệu lực.
 *
 * Hiển thị đúng tập capability mà server đang áp cho người này — để khi ai đó thắc mắc “sao
 * tôi không thấy nút X”, câu trả lời nằm ngay trên màn hình chứ không phải trong log.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const ctx = await getBocContext();

  const capabilities = [...user.capabilities].sort();
  const grouped = new Map<string, Capability[]>();
  for (const capability of capabilities) {
    const [module] = capability.split('.');
    const bucket = grouped.get(module) ?? [];
    bucket.push(capability);
    grouped.set(module, bucket);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={user.profile.full_name}
        description={`${user.profile.job_title ?? 'Chưa có chức danh'} · ${user.unit?.name ?? 'Chưa gán đơn vị'}`}
      />

      <Card>
        <CardHeader title="Thông tin tài khoản" />
        <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Email" value={<span className="text-sm">{user.profile.email}</span>} />
          <Stat label="Mã nhân sự" value={user.profile.employee_code ?? '—'} />
          <Stat
            label="Công suất"
            value={formatHours(user.profile.capacity_hours_per_day ?? ctx.capacity.defaultHoursPerDay)}
            hint="Mỗi ngày làm việc"
          />
          <Stat
            label="Lần truy cập gần nhất"
            value={<span className="text-sm">{formatDateTime(user.profile.last_seen_at)}</span>}
          />
        </CardBody>
      </Card>

      <PasswordForm />

      <Card>
        <CardHeader
          title="Vai trò và phạm vi dữ liệu"
          description="Phạm vi quyết định bạn nhìn thấy những bản ghi nào; vai trò quyết định bạn làm được gì trên đó."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {user.actor.roles.map((role) => (
              <Badge key={role} tone="strategic">
                {ROLE_LABELS[role]}
              </Badge>
            ))}
            {user.actor.roles.length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">Chưa được gán vai trò nào.</span>
            ) : null}
          </div>

          <p className="text-sm text-[var(--text-muted)]">
            {user.scope.all
              ? 'Bạn xem được toàn bộ dữ liệu BOC.'
              : user.scope.unit_ids.size > 0
                ? `Bạn xem được dữ liệu của ${user.scope.unit_ids.size} đơn vị, cộng với các công việc bạn tạo, làm Lead, được giao hoặc phối hợp.`
                : 'Bạn xem được các công việc bạn tạo, làm Lead, được giao hoặc phối hợp.'}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Quyền hiệu lực (${capabilities.length})`}
          description="Tổng hợp từ vai trò + capability cấp riêng − capability bị thu hồi. Thay đổi có hiệu lực ngay ở lần tải trang kế tiếp."
        />
        <CardBody className="space-y-4">
          {[...grouped.entries()].map(([module, list]) => (
            <div key={module}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                {module}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((capability) => (
                  <Badge key={capability} tone="neutral" title={capability}>
                    {CAPABILITY_LABELS[capability] ?? capability}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {capabilities.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Tài khoản chưa có quyền nào. Liên hệ quản trị hệ thống.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
