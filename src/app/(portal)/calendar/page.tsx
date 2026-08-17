import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

import { ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import {
  addDays,
  eachDay,
  isWorkingDay,
  monthRange,
  type DateRange,
} from '@/domain/business-days';
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
 * Hiển thị mốc **kết thúc** (deadline) vì đó là thứ cần can thiệp. Ngày nghỉ được tô khác để người dùng hiểu vì sao “còn N ngày
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

  const prevMonth = addDays(range.start, -1).slice(0, 7);
  const nextMonth = addDays(range.end, 1).slice(0, 7);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lịch & deadline"
        description="Mốc hạn hoàn thành theo ngày hiển thị. Ngày nghỉ được loại khỏi cách tính “còn bao nhiêu ngày làm việc”."
        actions={
          <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            <Link href={`/calendar?month=${prevMonth}`} className="rounded px-2.5 py-1.5 hover:bg-[var(--surface-hover)]">
              ← Tháng trước
            </Link>
            <span className="tabular px-2 font-medium">{range.start.slice(0, 7).split('-').reverse().join('/')}</span>
            <Link href={`/calendar?month=${nextMonth}`} className="rounded px-2.5 py-1.5 hover:bg-[var(--surface-hover)]">
              Tháng sau →
            </Link>
            {user.capabilities.has('calendar.manage') ? (
              <ButtonLink href="/admin/holidays" variant="ghost" size="sm">
                Xem lịch nghỉ
              </ButtonLink>
            ) : null}
          </div>
        }
      />

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
