import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { TableShell, Td, Th, Tr } from '@/components/ui/table';
import { formatHours, formatInteger } from '@/lib/format';
import { requireCapability } from '@/server/auth/current-user';
import { listUnits, profileMap } from '@/server/repositories/catalogs';
import { listAllWorkItems } from '@/server/repositories/work-items';

export const metadata: Metadata = { title: 'Cơ cấu đơn vị' };

export default async function AdminOrganizationPage() {
  await requireCapability('organization.manage');

  const [units, profiles, items] = await Promise.all([
    listUnits(),
    profileMap(),
    listAllWorkItems(),
  ]);

  const countByUnit = new Map<string, number>();
  for (const item of items) {
    if (item.is_archived) continue;
    countByUnit.set(item.owning_unit_id, (countByUnit.get(item.owning_unit_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cơ cấu đơn vị"
        description="Quan hệ quản lý quyết định phạm vi dữ liệu của quản lý đơn vị: người quản lý một đơn vị sẽ thấy toàn bộ công việc của đơn vị đó và các đơn vị con."
      />

      <Card className="overflow-hidden">
        <CardHeader
          title={`Đơn vị (${units.length})`}
          description="Danh sách trích từ danh mục của Google Sheet nguồn — cần Product Owner xác nhận là danh sách chính thức."
        />
        <TableShell caption="Danh sách đơn vị">
          <thead>
            <tr>
              <Th sticky>Mã</Th>
              <Th>Tên đơn vị</Th>
              <Th>Trực thuộc</Th>
              <Th>Loại</Th>
              <Th>Người quản lý</Th>
              <Th align="right">Công suất riêng</Th>
              <Th align="right">Công việc đang có</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <Tr key={unit.id}>
                <Td sticky className="font-mono text-xs">
                  {unit.code}
                </Td>
                <Td>{unit.name}</Td>
                <Td className="text-xs text-[var(--text-muted)]">
                  {unit.parent_id ? (units.find((u) => u.id === unit.parent_id)?.name ?? '—') : '—'}
                </Td>
                <Td className="text-xs text-[var(--text-muted)]">
                  {unit.unit_type === 'COMPANY'
                    ? 'Công ty'
                    : unit.unit_type === 'CENTER'
                      ? 'Trung tâm'
                      : unit.unit_type === 'DEPARTMENT'
                        ? 'Phòng ban'
                        : 'Nhóm'}
                </Td>
                <Td className="text-xs">
                  {unit.manager_user_id ? (
                    (profiles.get(unit.manager_user_id)?.full_name ?? '—')
                  ) : (
                    <Badge tone="warning">Chưa gán</Badge>
                  )}
                </Td>
                <Td align="right" className="text-xs text-[var(--text-muted)]">
                  {formatHours(unit.capacity_hours_per_day)}
                </Td>
                <Td align="right">
                  <Link
                    href={`/work-items?unit=${unit.id}`}
                    className="tabular text-sm hover:underline"
                  >
                    {formatInteger(countByUnit.get(unit.id) ?? 0)}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={unit.is_active ? 'success' : 'muted'}>
                    {unit.is_active ? 'Hoạt động' : 'Ngừng'}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Card>
    </div>
  );
}
