import type { Metadata } from 'next';
import Link from 'next/link';
import { FileDown, ListTree, Plus, SearchX } from 'lucide-react';

import {
  DataQualityBadge,
  LevelBadge,
  PriorityBadge,
  StatusBadge,
} from '@/components/ui/badges';
import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { Pagination, SortHeader, TableShell, Td, Th, Tr } from '@/components/ui/table';
import { deadlineDaysAway, formatDate } from '@/domain/business-days';
import { isOpen } from '@/domain/metrics';
import { deadlineDateOf, isOverdue } from '@/domain/dates';
import { remainingHours } from '@/domain/progress';
import type { WorkItem } from '@/domain/types';
import { formatDaysLeft, formatHours } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listActiveProfiles, listUnits } from '@/server/repositories/catalogs';
import { searchWorkItems } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

import { FilterBar } from './filter-bar';
import {
  buildDerivedFilter,
  countActiveFilters,
  parseFilters,
  toURLSearchParams,
  type SearchParams,
} from './filters';

export const metadata: Metadata = { title: 'Tất cả công việc' };

export default async function WorkItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const ctx = await getBocContext();

  const parsed = parseFilters(params);
  const page = await searchWorkItems(parsed.query, user.scope, buildDerivedFilter(parsed, ctx));
  const rows = page.rows;

  const [units, profiles] = await Promise.all([listUnits(), listActiveProfiles()]);
  const baseParams = toURLSearchParams(params);
  const canCreate = user.capabilities.has('work.create_l3') || user.capabilities.has('work.create_child');
  const currentSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const currentDir = (Array.isArray(params.dir) ? params.dir[0] : params.dir) === 'desc' ? 'desc' : 'asc';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tất cả công việc"
        description="Toàn bộ cây công việc từ L3 trở xuống trong phạm vi dữ liệu của bạn. Lọc, sắp xếp và phân trang đều chạy phía máy chủ."
        actions={
          <>
            {user.capabilities.has('report.export') ? (
              <ButtonLink
                href={`/api/exports/work-items?${baseParams.toString()}`}
                variant="secondary"
                size="sm"
                prefetch={false}
              >
                <FileDown aria-hidden className="size-4" />
                Xuất XLSX
              </ButtonLink>
            ) : null}
            {canCreate ? (
              <ButtonLink href="/work-items/new" variant="primary" size="sm">
                <Plus aria-hidden className="size-4" />
                Tạo công việc
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card className="p-4">
        <FilterBar
          units={units.map((u) => ({ id: u.id, name: u.name }))}
          people={profiles.map((p) => ({ id: p.user_id, name: p.full_name }))}
          years={[...new Set(page.rows.map((r) => r.year))].sort((a, b) => b - a)}
        />
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={countActiveFilters(params) > 0 ? SearchX : ListTree}
            title={
              countActiveFilters(params) > 0
                ? 'Không có công việc nào khớp bộ lọc'
                : 'Chưa có công việc nào trong phạm vi của bạn'
            }
            description={
              countActiveFilters(params) > 0
                ? 'Thử nới bộ lọc hoặc xóa toàn bộ điều kiện để xem lại danh sách đầy đủ.'
                : 'Khi được giao việc hoặc được cấp phạm vi đơn vị, danh sách sẽ hiện ở đây.'
            }
            action={
              countActiveFilters(params) > 0 ? (
                <ButtonLink href="/work-items" size="sm">
                  Xóa bộ lọc
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <>
            <TableShell caption="Danh sách công việc từ L3 trở xuống">
              <thead>
                <tr>
                  <SortHeader field="code" currentSort={currentSort} currentDir={currentDir} baseParams={baseParams}>
                    Mã
                  </SortHeader>
                  <Th>Tên công việc</Th>
                  <Th>Đơn vị</Th>
                  <Th>Người thực hiện</Th>
                  <SortHeader field="status" currentSort={currentSort} currentDir={currentDir} baseParams={baseParams}>
                    Trạng thái
                  </SortHeader>
                  <SortHeader field="priority" currentSort={currentSort} currentDir={currentDir} baseParams={baseParams}>
                    Ưu tiên
                  </SortHeader>
                  <Th className="w-40">Tiến độ</Th>
                  <SortHeader
                    field="display_end"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    baseParams={baseParams}
                    align="right"
                  >
                    Hạn
                  </SortHeader>
                  <Th align="right">Còn lại</Th>
                  <Th align="right">Giờ còn</Th>
                  <Th>Dữ liệu</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <Row key={item.id} item={item} ctx={ctx} />
                ))}
              </tbody>
            </TableShell>

            <Pagination
              page={page.page}
              pageCount={page.pageCount}
              total={page.total}
              pageSize={page.pageSize}
              baseParams={baseParams}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function Row({
  item,
  ctx,
}: {
  item: WorkItem;
  ctx: Awaited<ReturnType<typeof getBocContext>>;
}) {
  // Việc đã đóng không còn “còn mấy ngày”: dòng hoàn thành từng hiện “Đến hạn hôm nay”.
  const daysLeft = isOpen(item)
    ? deadlineDaysAway(ctx.today, deadlineDateOf(item), ctx.calendar)
    : null;
  const overdue = isOverdue(item, ctx.today);

  return (
    <Tr>
      <Td sticky>
        <Link
          href={`/work-items/${item.id}`}
          className="flex items-center gap-2 font-mono text-xs hover:underline"
        >
          <LevelBadge level={item.level} />
          <span className="truncate">{item.code}</span>
        </Link>
      </Td>
      <Td className="max-w-md">
        <Link href={`/work-items/${item.id}`} className="block truncate hover:underline">
          {item.title}
        </Link>
      </Td>
      <Td className="text-xs text-[var(--text-muted)]">{ctx.names.unitName(item.owning_unit_id)}</Td>
      <Td className="text-xs text-[var(--text-muted)]">
        {item.primary_assignee_id ? (
          ctx.names.userName(item.primary_assignee_id)
        ) : (
          <span className="text-[var(--tone-warning-text)]">Chưa giao</span>
        )}
      </Td>
      <Td>
        <StatusBadge status={item.status} />
      </Td>
      <Td>
        <PriorityBadge priority={item.priority} />
      </Td>
      <Td>
        <ProgressBar value={item.effective_progress} size="sm" />
      </Td>
      <Td align="right" className="text-xs">
        {formatDate(item.display_end)}
      </Td>
      <Td
        align="right"
        className={overdue ? 'text-xs text-[var(--tone-danger-text)]' : 'text-xs text-[var(--text-muted)]'}
      >
        {formatDaysLeft(daysLeft)}
      </Td>
      <Td align="right" className="text-xs text-[var(--text-muted)]">
        {formatHours(remainingHours(item))}
      </Td>
      <Td>
        <DataQualityBadge
          status={item.data_quality_status}
          codeCount={item.data_quality_codes.length}
        />
      </Td>
    </Tr>
  );
}
