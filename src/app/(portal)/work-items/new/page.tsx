import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/ui/primitives';
import type { WorkLevel } from '@/domain/types';
import { requireUser } from '@/server/auth/current-user';
import {
  listCategories,
  listActiveProfiles,
  listManagementLevels,
  listUnits,
} from '@/server/repositories/catalogs';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

import { WorkItemForm } from '../work-item-form';

export const metadata: Metadata = { title: 'Tạo công việc' };

export default async function NewWorkItemPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string; level?: string }>;
}) {
  const user = await requireUser();
  const canCreate =
    user.capabilities.has('work.create_l3') || user.capabilities.has('work.create_child');
  if (!canCreate) redirect('/work-items?denied=work.create_child');

  const { parent, level } = await searchParams;
  const ctx = await getBocContext();

  const [units, profiles, managementLevels, categories, items] = await Promise.all([
    listUnits(),
    listActiveProfiles(),
    listManagementLevels(),
    listCategories(),
    listWorkItemsInScope(user.scope),
  ]);

  // Chỉ đề xuất làm cha những node mà người này thực sự thấy được.
  const parents = items
    .filter((item) => item.level < 6 && !item.is_archived && item.status !== 'CANCELLED')
    .map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      level: item.level,
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Tạo công việc mới"
        description="Mã công việc do hệ thống sinh tự động theo cấp và năm. Các giá trị tính toán (tiến độ cuộn, ngày hiển thị, chất lượng dữ liệu) sẽ được cập nhật ngay sau khi lưu."
      />

      <WorkItemForm
        mode="create"
        units={units.map((u) => ({ value: u.id, label: u.name }))}
        people={profiles.map((p) => ({ value: p.user_id, label: p.full_name }))}
        managementLevels={managementLevels.map((m) => ({ value: m.id, label: m.name }))}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        parents={parents}
        defaultYear={Number(ctx.today.slice(0, 4))}
        defaultLevel={level ? (Number(level) as WorkLevel) : undefined}
        defaultParentId={parent}
      />
    </div>
  );
}
