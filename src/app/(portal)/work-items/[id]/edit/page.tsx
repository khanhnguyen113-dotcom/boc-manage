import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { Alert, PageHeader } from '@/components/ui/primitives';
import { canReadWorkItem, relationTo } from '@/domain/permissions';
import { requireUser } from '@/server/auth/current-user';
import {
  listActiveProfiles,
  listCategories,
  listManagementLevels,
  listUnits,
} from '@/server/repositories/catalogs';
import { getWorkItem, listAssignments, listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

import { WorkItemForm } from '../../work-item-form';
import { DeleteWorkItemPanel } from './delete-work-item-panel';

export const metadata: Metadata = { title: 'Chỉnh sửa công việc' };

export default async function EditWorkItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const item = await getWorkItem(id);
  if (!item) notFound();

  const assignments = await listAssignments(item.id);
  const relation = relationTo(
    item,
    user.actor.user_id,
    assignments.map((a) => a.user_id),
  );
  if (!canReadWorkItem(user.actor, user.scope, item, relation)) notFound();
  if (!user.capabilities.has('work.edit_core')) redirect(`/work-items/${id}?denied=work.edit_core`);

  const ctx = await getBocContext();
  const [units, profiles, managementLevels, categories, items] = await Promise.all([
    listUnits(),
    listActiveProfiles(),
    listManagementLevels(),
    listCategories(),
    listWorkItemsInScope(user.scope),
  ]);

  const parents = items
    .filter(
      (candidate) =>
        candidate.id !== item.id &&
        !candidate.is_archived &&
        candidate.status !== 'CANCELLED',
    )
    .map((candidate) => ({
      id: candidate.id,
      code: candidate.code,
      title: candidate.title,
      level: candidate.level,
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={`Chỉnh sửa ${item.code}`}
        description="Thay đổi công việc cha, hạn kết thúc, khối lượng, mức ưu tiên hay người thực hiện đều là thay đổi phạm vi — hệ thống ghi lại giá trị trước/sau và lý do."
      />

      {!item.is_leaf ? (
        <Alert tone="info" title="Đây là công việc cha">
          Tiến độ, ngày hiển thị và tổng khối lượng của bản ghi này được tính từ các công việc con.
          Giá trị nhập tay ở phần Nguồn lực chỉ dùng khi công việc chưa có con.
        </Alert>
      ) : null}

      <WorkItemForm
        mode="edit"
        item={item}
        units={units.map((u) => ({ value: u.id, label: u.name }))}
        people={profiles.map((p) => ({ value: p.user_id, label: p.full_name }))}
        managementLevels={managementLevels.map((m) => ({ value: m.id, label: m.name }))}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        parents={parents}
        defaultYear={Number(ctx.today.slice(0, 4))}
      />

      {user.capabilities.has('work.delete') ? (
        <DeleteWorkItemPanel id={item.id} version={item.version} />
      ) : null}
    </div>
  );
}
