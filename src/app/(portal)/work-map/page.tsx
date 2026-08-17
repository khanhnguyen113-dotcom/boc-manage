import type { Metadata } from 'next';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';

import { LevelBadge } from '@/components/ui/badges';
import { Alert, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { deadlineDaysAway } from '@/domain/business-days';
import { buildTreeIndex, type TreeIndex } from '@/domain/hierarchy';
import type { WorkItem } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatInteger } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Bản đồ công việc' };

/**
 * Cây từ L3 trở xuống — guideline 5.3 “Tree”.
 *
 * Dùng `<details>` gốc của HTML: mở/đóng chạy được cả khi JS chưa tải, có sẵn ngữ nghĩa cho
 * screen reader và tự lưu trạng thái khi in. Nhánh L3 mặc định mở, các nhánh sâu hơn thu gọn để
 * không đổ hàng trăm dòng cùng lúc.
 */
export default async function WorkMapPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; year?: string }>;
}) {
  const user = await requireUser();
  const { unit, year } = await searchParams;
  const ctx = await getBocContext();

  let items = await listWorkItemsInScope(user.scope, {
    year: year ? Number(year) : undefined,
  });
  if (unit) items = items.filter((i) => i.owning_unit_id === unit);

  const tree = buildTreeIndex(items);
  const roots = tree.roots.filter((r) => r.level === 3);
  const orphans = tree.roots.filter((r) => r.level !== 3);
  const canCreateWork =
    user.capabilities.has('work.create_l3') || user.capabilities.has('work.create_child');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bản đồ công việc"
        description="Mặc định tập trung L3 → L4 → L5; có thể mở rộng sâu hơn khi cần. Tiến độ và ngày hiển thị ở công việc cha được tính tự động từ các công việc con."
      />

      {orphans.length > 0 ? (
        <Alert tone="danger" title={`${orphans.length} công việc mất liên kết cha`}>
          Các bản ghi dưới đây có cấp từ L4 trở đi nhưng không tìm thấy công việc cha trong phạm vi dữ
          liệu. Đây là lỗi cấu trúc cần xử lý trước khi tin vào số liệu tổng hợp:{' '}
          {orphans.map((o) => o.code).join(', ')}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          icon={GitBranch}
          title={`${formatInteger(roots.length)} công việc chính (L3)`}
          description={`Tổng ${formatInteger(items.length)} bản ghi trong phạm vi. Bấm vào từng nhánh để mở rộng.`}
        />

        {roots.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="Chưa có công việc nào"
            description="Không có công việc L3 nào trong phạm vi dữ liệu của bạn."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {roots.map((root) => (
              <li key={root.id}>
                <TreeNode
                  node={root}
                  tree={tree}
                  ctx={ctx}
                  depth={0}
                  defaultOpen={roots.length <= 6}
                  canCreateWork={canCreateWork}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TreeNode({
  node,
  tree,
  ctx,
  depth,
  defaultOpen,
  canCreateWork,
}: {
  node: WorkItem;
  tree: TreeIndex;
  ctx: Awaited<ReturnType<typeof getBocContext>>;
  depth: number;
  defaultOpen?: boolean;
  canCreateWork: boolean;
}) {
  const children = (tree.childrenOf.get(node.id) ?? []).filter((c) => !c.is_archived);
  const daysLeft = deadlineDaysAway(ctx.today, node.display_end, ctx.calendar);
  const deadlineLabel =
    daysLeft === null
      ? 'Chưa có hạn'
      : daysLeft < 0
        ? `Quá hạn ${Math.abs(daysLeft)} ngày`
        : daysLeft === 0
          ? 'Đến hạn hôm nay'
          : `Còn ${daysLeft} ngày`;
  const titleClass =
    depth === 0
      ? 'text-base font-semibold'
      : depth === 1
        ? 'text-sm font-semibold'
        : depth === 2
          ? 'text-sm font-medium'
          : 'text-xs font-normal text-[var(--text-muted)]';

  const summary = (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-4"
      style={{ paddingLeft: `${1.25 + depth * 1.25}rem` }}
    >
      <LevelBadge level={node.level} />

      <Link
        href={`/work-items/${node.id}`}
        className={cn('min-w-0 flex-1 truncate hover:underline', titleClass)}
        title={node.title}
      >
        {node.title}
      </Link>

      {canCreateWork ? (
        <Link
          href={`/work-items/new?parent=${node.id}&level=${node.level + 1}`}
          className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          title={`Tạo công việc con L${node.level + 1}`}
        >
          + L{node.level + 1}
        </Link>
      ) : null}

      <span
        className={cn(
          'shrink-0 text-right text-[11px] font-medium',
          daysLeft !== null && daysLeft <= 0
            ? 'text-[var(--tone-danger-text)]'
            : daysLeft !== null && daysLeft <= 2
              ? 'text-[var(--tone-warning-text)]'
              : 'text-[var(--text-muted)]',
        )}
      >
        {deadlineLabel}
      </span>
    </div>
  );

  if (children.length === 0) {
    return <div className="hover:bg-[var(--surface-hover)]">{summary}</div>;
  }

  return (
    <details open={defaultOpen} className="group">
      <summary className="cursor-pointer list-none hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden">
        <div className="flex items-center">
          <span
            aria-hidden
            className="ml-1 text-[10px] text-[var(--text-subtle)] transition-transform group-open:rotate-90"
            style={{ marginLeft: `${depth * 1.25}rem` }}
          >
            ▶
          </span>
          <span className="min-w-0 flex-1">{summary}</span>
        </div>
      </summary>

      <ul className="border-l border-[var(--border)]" style={{ marginLeft: `${1 + depth}rem` }}>
        {children.map((child) => (
          <li key={child.id}>
            <TreeNode
              node={child}
              tree={tree}
              ctx={ctx}
              depth={depth + 1}
              canCreateWork={canCreateWork}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
