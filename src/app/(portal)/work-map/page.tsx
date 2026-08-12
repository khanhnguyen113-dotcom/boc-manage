import type { Metadata } from 'next';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';

import { DataQualityBadge, LevelBadge, PriorityBadge, StatusBadge } from '@/components/ui/badges';
import { Alert, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { formatDate } from '@/domain/business-days';
import { isOverdue } from '@/domain/dates';
import { buildTreeIndex, type TreeIndex } from '@/domain/hierarchy';
import type { WorkItem } from '@/domain/types';
import { formatHours, formatInteger } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Bản đồ công việc' };

/**
 * Cây L3–L6 — guideline 5.3 “Tree”.
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bản đồ công việc"
        description="Phân rã L3 → L4 → L5 → L6. Tiến độ và ngày hiển thị ở công việc cha đều được tính tự động từ các công việc con."
      />

      {orphans.length > 0 ? (
        <Alert tone="danger" title={`${orphans.length} công việc mất liên kết cha`}>
          Các bản ghi dưới đây có cấp L4–L6 nhưng không tìm thấy công việc cha trong phạm vi dữ
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
                <TreeNode node={root} tree={tree} ctx={ctx} depth={0} defaultOpen={roots.length <= 6} />
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
}: {
  node: WorkItem;
  tree: TreeIndex;
  ctx: Awaited<ReturnType<typeof getBocContext>>;
  depth: number;
  defaultOpen?: boolean;
}) {
  const children = (tree.childrenOf.get(node.id) ?? []).filter((c) => !c.is_archived);
  const overdue = isOverdue(node, ctx.today);

  const summary = (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-4"
      style={{ paddingLeft: `${1.25 + depth * 1.25}rem` }}
    >
      <LevelBadge level={node.level} />

      <Link
        href={`/work-items/${node.id}`}
        className="min-w-0 flex-1 truncate text-sm hover:underline"
        title={node.title}
      >
        <span className="font-mono text-[11px] text-[var(--text-subtle)]">{node.code}</span>{' '}
        <span className={depth === 0 ? 'font-medium' : ''}>{node.title}</span>
      </Link>

      <span className="hidden w-32 shrink-0 md:block">
        <ProgressBar value={node.effective_progress} size="sm" />
      </span>

      <span className="hidden shrink-0 text-[11px] text-[var(--text-muted)] lg:block">
        {ctx.names.userName(node.primary_assignee_id)}
      </span>

      <span
        className={
          overdue
            ? 'hidden w-24 shrink-0 text-right text-[11px] text-[var(--tone-danger-text)] sm:block'
            : 'hidden w-24 shrink-0 text-right text-[11px] text-[var(--text-muted)] sm:block'
        }
      >
        {formatDate(node.display_end)}
      </span>

      <span className="hidden w-16 shrink-0 text-right text-[11px] text-[var(--text-muted)] xl:block">
        {formatHours(node.effective_estimated_hours)}
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        <PriorityBadge priority={node.priority} />
        <StatusBadge status={node.status} />
        {node.data_quality_status !== 'VALID' ? (
          <DataQualityBadge
            status={node.data_quality_status}
            codeCount={node.data_quality_codes.length}
          />
        ) : null}
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
            <TreeNode node={child} tree={tree} ctx={ctx} depth={depth + 1} />
          </li>
        ))}
      </ul>
    </details>
  );
}
