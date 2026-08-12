import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, CalendarX } from 'lucide-react';

import { LevelBadge, PriorityBadge, StatusBadge } from '@/components/ui/badges';
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import {
  addDays,
  eachDay,
  formatDate,
  isWorkingDay,
  monthRange,
  type DateRange,
} from '@/domain/business-days';
import { isOverdue } from '@/domain/dates';
import type { WorkItem } from '@/domain/types';
import { cn } from '@/lib/cn';
import { requireUser } from '@/server/auth/current-user';
import { listHolidays } from '@/server/repositories/catalogs';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Lịch & deadline' };

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Lịch tháng — guideline 6.6.
 *
 * Hiển thị mốc **kết thúc** (deadline) vì đó là thứ cần can thiệp; ngày bắt đầu và ngày rà soát
 * xuất hiện ở danh sách bên phải. Ngày nghỉ được tô khác để người dùng hiểu vì sao “còn N ngày
 * làm việc” không bằng số ngày lịch.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { month } = await searchParams;
  const ctx = await getBocContext();

  const anchor = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : ctx.today;
  const range = monthRange(anchor);

  const items = await listWorkItemsInScope(user.scope);
  const active = items.filter((i) => !i.is_archived && i.status !== 'CANCELLED');

  const byDay = new Map<string, WorkItem[]>();
  for (const item of active) {
    if (!item.display_end) continue;
    if (item.display_end < range.start || item.display_end > range.end) continue;
    const bucket = byDay.get(item.display_end);
    if (bucket) bucket.push(item);
    else byDay.set(item.display_end, [item]);
  }

  const holidays = (await listHolidays()).filter(
    (h) => h.holiday_date >= range.start && h.holiday_date <= range.end,
  );
  const holidayByDate = new Map(holidays.map((h) => [h.holiday_date, h]));

  const overdueItems = active
    .filter((i) => isOverdue(i, ctx.today))
    .sort((a, b) => (a.display_end ?? '').localeCompare(b.display_end ?? ''));

  const reviews = active
    .filter((i) => i.review_date && i.review_date >= range.start && i.review_date <= range.end)
    .sort((a, b) => (a.review_date ?? '').localeCompare(b.review_date ?? ''));

  const prevMonth = addDays(range.start, -1).slice(0, 7);
  const nextMonth = addDays(range.end, 1).slice(0, 7);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lịch & deadline"
        description="Mốc hạn hoàn thành theo ngày hiển thị. Ngày nghỉ được loại khỏi cách tính “còn bao nhiêu ngày làm việc”."
        actions={
          <div className="flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            <Link href={`/calendar?month=${prevMonth}`} className="rounded px-2.5 py-1.5 hover:bg-[var(--surface-hover)]">
              ← Tháng trước
            </Link>
            <span className="tabular px-2 font-medium">{range.start.slice(0, 7).split('-').reverse().join('/')}</span>
            <Link href={`/calendar?month=${nextMonth}`} className="rounded px-2.5 py-1.5 hover:bg-[var(--surface-hover)]">
              Tháng sau →
            </Link>
          </div>
        }
      />

      {holidays.some((h) => !h.is_confirmed) ? (
        <Alert tone="warning" title="Có ngày nghỉ chưa được HR xác nhận trong tháng này">
          {holidays
            .filter((h) => !h.is_confirmed)
            .map((h) => `${formatDate(h.holiday_date)} — ${h.name}`)
            .join('; ')}
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            icon={CalendarDays}
            title="Hạn hoàn thành trong tháng"
            description={`Tổng ${[...byDay.values()].reduce((s, v) => s + v.length, 0)} công việc đến hạn.`}
          />
          <div className="p-3">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]"
                >
                  {day}
                </div>
              ))}

              {buildCalendarCells(range).map((date, index) => {
                if (!date) return <div key={`empty-${index}`} />;

                const dayItems = byDay.get(date) ?? [];
                const holiday = holidayByDate.get(date);
                const working = isWorkingDay(date, ctx.calendar);
                const isToday = date === ctx.today;

                return (
                  <div
                    key={date}
                    className={cn(
                      'min-h-24 rounded-[var(--radius-sm)] border p-1.5',
                      working
                        ? 'border-[var(--border)] bg-[var(--surface)]'
                        : 'border-[var(--border)] bg-[var(--surface-sunken)]',
                      isToday && 'ring-2 ring-[var(--brand-600)]',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span
                        className={cn(
                          'tabular text-[11px] font-medium',
                          isToday ? 'text-[var(--brand-700)]' : 'text-[var(--text-muted)]',
                        )}
                      >
                        {Number(date.slice(8, 10))}
                      </span>
                      {holiday ? (
                        <span
                          title={holiday.name}
                          className="truncate text-[9px] text-[var(--tone-danger-text)]"
                        >
                          Nghỉ
                        </span>
                      ) : null}
                    </div>

                    <ul className="mt-1 space-y-0.5">
                      {dayItems.slice(0, 3).map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/work-items/${item.id}`}
                            title={`${item.code} · ${item.title}`}
                            className={cn(
                              'block truncate rounded px-1 py-0.5 text-[10px] leading-4',
                              item.priority === 'P1'
                                ? 'bg-[var(--tone-danger-bg)] text-[var(--tone-danger-text)]'
                                : item.status === 'COMPLETED'
                                  ? 'bg-[var(--tone-success-bg)] text-[var(--tone-success-text)]'
                                  : 'bg-[var(--tone-info-bg)] text-[var(--tone-info-text)]',
                            )}
                          >
                            {item.title}
                          </Link>
                        </li>
                      ))}
                      {dayItems.length > 3 ? (
                        <li className="px-1 text-[10px] text-[var(--text-subtle)]">
                          +{dayItems.length - 3} việc khác
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={CalendarX}
              title={
                <span className="flex items-center gap-2">
                  Đang quá hạn
                  <Badge tone="danger">{overdueItems.length}</Badge>
                </span>
              }
              description="Tính trên toàn phạm vi, không giới hạn trong tháng đang xem."
            />
            {overdueItems.length === 0 ? (
              <EmptyState title="Không có việc quá hạn" />
            ) : (
              <ul className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto">
                {overdueItems.slice(0, 20).map((item) => (
                  <li key={item.id} className="px-4 py-2.5">
                    <Link href={`/work-items/${item.id}`} className="flex items-start gap-2">
                      <LevelBadge level={item.level} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm hover:underline">{item.title}</span>
                        <span className="text-[11px] text-[var(--tone-danger-text)]">
                          Hạn {formatDate(item.display_end)}
                        </span>
                      </span>
                      <PriorityBadge priority={item.priority} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Ngày rà soát trong tháng" />
            {reviews.length === 0 ? (
              <EmptyState title="Không có mốc rà soát" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {reviews.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="tabular w-20 shrink-0 text-[11px] text-[var(--text-muted)]">
                      {formatDate(item.review_date)}
                    </span>
                    <Link href={`/work-items/${item.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {item.title}
                    </Link>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Ô lịch bắt đầu từ Thứ Hai; ô trống ở đầu tháng trả về `null`. */
function buildCalendarCells(range: DateRange): (string | null)[] {
  const days = eachDay(range);
  const firstDow = new Date(`${range.start}T00:00:00Z`).getUTCDay();
  const leading = firstDow === 0 ? 6 : firstDow - 1;
  return [...Array.from({ length: leading }, () => null), ...days];
}
