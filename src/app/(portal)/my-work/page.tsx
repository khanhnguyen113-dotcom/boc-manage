import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlarmClock,
  AlertOctagon,
  CalendarCheck,
  CheckCircle2,
  Flag,
  RefreshCw,
  Sunrise,
} from 'lucide-react';

import {
  DataQualityBadge,
  LevelBadge,
  PriorityBadge,
  StatusBadge,
} from '@/components/ui/badges';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { businessDaysLeft, formatDate, isWithin, weekRange } from '@/domain/business-days';
import { isOverdue } from '@/domain/dates';
import { isOccurrenceDue } from '@/domain/execution';
import type { ExecutionLog, WorkItem } from '@/domain/types';
import { formatDaysLeft } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listExecutionLogsFor } from '@/server/repositories/collaboration';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

import { QuickUpdate } from './quick-update';

export const metadata: Metadata = { title: 'Việc của tôi' };

/**
 * Guideline 6.3 — các nhóm việc được sắp theo thứ tự người dùng cần xử lý:
 * quá hạn trước, rồi hôm nay, rồi tuần này.
 */
export default async function MyWorkPage() {
  const user = await requireUser();
  const ctx = await getBocContext();
  const userId = user.actor.user_id;

  const all = await listWorkItemsInScope(user.scope);

  // “Việc của tôi” = việc tôi thực hiện hoặc tôi làm Lead, không phải toàn bộ scope.
  const mine = all.filter(
    (item) =>
      !item.is_archived &&
      item.status !== 'CANCELLED' &&
      (item.primary_assignee_id === userId || item.lead_user_id === userId),
  );

  const open = mine.filter((i) => i.status !== 'COMPLETED');
  const logs = await listExecutionLogsFor(mine.map((i) => i.id));
  const logsByItem = new Map<string, ExecutionLog[]>();
  for (const log of logs) {
    const bucket = logsByItem.get(log.work_item_id);
    if (bucket) bucket.push(log);
    else logsByItem.set(log.work_item_id, [log]);
  }

  const week = weekRange(ctx.today);

  const overdue = open.filter((i) => isOverdue(i, ctx.today));
  const dueToday = open.filter((i) => i.display_end === ctx.today && !overdue.includes(i));
  const dueThisWeek = open.filter(
    (i) =>
      !overdue.includes(i) &&
      !dueToday.includes(i) &&
      isWithin(i.display_end, week),
  );
  const priorityOne = open.filter(
    (i) => i.priority === 'P1' && !overdue.includes(i) && !dueToday.includes(i),
  );
  const needsData = open.filter(
    (i) => i.is_leaf && i.data_quality_status !== 'VALID' && !overdue.includes(i),
  );
  const occurrenceDue = open.filter((i) =>
    isOccurrenceDue(i, logsByItem.get(i.id) ?? [], ctx.today),
  );
  const completedThisWeek = mine.filter(
    (i) => i.status === 'COMPLETED' && isWithin(i.completed_at, week),
  );

  const groups = [
    {
      key: 'overdue',
      title: 'Quá hạn',
      icon: AlertOctagon,
      tone: 'danger' as const,
      description: 'Hạn hiển thị đã trôi qua nhưng công việc chưa hoàn thành.',
      items: overdue,
    },
    {
      key: 'today',
      title: 'Đến hạn hôm nay',
      icon: Sunrise,
      tone: 'warning' as const,
      description: `Hạn đúng ngày nghiệp vụ ${formatDate(ctx.today)}.`,
      items: dueToday,
    },
    {
      key: 'week',
      title: 'Trong tuần này',
      icon: CalendarCheck,
      tone: 'info' as const,
      description: `Từ ${formatDate(week.start)} đến ${formatDate(week.end)}.`,
      items: dueThisWeek,
    },
    {
      key: 'p1',
      title: 'Ưu tiên P1',
      icon: Flag,
      tone: 'strategic' as const,
      description: 'Việc trọng yếu chưa đến hạn nhưng cần giữ nhịp.',
      items: priorityOne,
    },
    {
      key: 'recurring',
      title: 'Định kỳ đến kỳ',
      icon: RefreshCw,
      tone: 'progress' as const,
      description: 'Kỳ hiện tại chưa có nhật ký thực hiện.',
      items: occurrenceDue,
    },
    {
      key: 'data',
      title: 'Cần bổ sung dữ liệu',
      icon: AlarmClock,
      tone: 'muted' as const,
      description: 'Thiếu tham số nên chưa vào được kết luận tải và báo cáo.',
      items: needsData,
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Chào ${user.profile.full_name.split(' ').slice(-1)[0]}`}
        description={
          <>
            Bạn đang phụ trách <strong>{open.length}</strong> công việc đang mở
            {overdue.length > 0 ? (
              <>
                , trong đó{' '}
                <strong className="text-[var(--tone-danger-text)]">{overdue.length} đã quá hạn</strong>
              </>
            ) : null}
            . Hoàn thành trong tuần: <strong>{completedThisWeek.length}</strong>.
          </>
        }
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Không có việc nào cần xử lý ngay"
            description="Bạn không có công việc quá hạn, đến hạn trong tuần hay kỳ định kỳ nào đang chờ ghi nhật ký."
          />
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.key}>
            <CardHeader
              icon={group.icon}
              title={
                <span className="flex items-center gap-2">
                  {group.title}
                  <Badge tone={group.tone}>{group.items.length}</Badge>
                </span>
              }
              description={group.description}
            />
            <ul className="divide-y divide-[var(--border)]">
              {group.items.map((item) => (
                <WorkRow key={item.id} item={item} ctx={ctx} userId={userId} canSubmitCompletion={user.capabilities.has('work.submit_completion')} />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function WorkRow({
  item,
  ctx,
  userId,
  canSubmitCompletion,
}: {
  item: WorkItem;
  ctx: Awaited<ReturnType<typeof getBocContext>>;
  userId: string;
  canSubmitCompletion: boolean;
}) {
  const daysLeft = businessDaysLeft(ctx.today, item.display_end, ctx.calendar);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={item.level} />
            <Link
              href={`/work-items/${item.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {item.title}
            </Link>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
            <code className="font-mono">{item.code}</code>
            <span>{ctx.names.unitName(item.owning_unit_id)}</span>
            {item.display_end ? (
              <span>
                Hạn {formatDate(item.display_end)} · {formatDaysLeft(daysLeft)}
              </span>
            ) : (
              <span className="text-[var(--tone-warning-text)]">Chưa có hạn</span>
            )}
            {item.data_quality_codes.length > 0 ? (
              <DataQualityBadge
                status={item.data_quality_status}
                codeCount={item.data_quality_codes.length}
              />
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="w-36">
            <ProgressBar value={item.effective_progress} size="sm" />
          </div>
          <PriorityBadge priority={item.priority} />
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="mt-3">
        <QuickUpdate item={item} today={ctx.today} canSubmitCompletion={canSubmitCompletion && item.primary_assignee_id === userId} />
      </div>
    </li>
  );
}
