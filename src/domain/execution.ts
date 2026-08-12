/**
 * Nhật ký thực hiện cho việc định kỳ / phát sinh — BR-REC-001…005.
 *
 * Điểm cốt lõi (guideline 11.3): số liệu định kỳ tính **từ `execution_logs`**, không suy ra từ
 * trạng thái của công việc cha. Giờ thực tế chỉ đến từ log, không bao giờ suy từ giờ ước tính.
 */

import { addDays, isWithin, monthRange, weekRange, type DateRange } from './business-days';
import type {
  BusinessDate,
  DeadlineResult,
  ExecutionLog,
  RecurrenceCycle,
  WorkItem,
} from './types';

/** BR-REC-001: việc định kỳ bắt buộc có chu kỳ. */
export function requiresRecurrenceRule(item: Pick<WorkItem, 'schedule_type'>): boolean {
  return item.schedule_type === 'RECURRING';
}

/** BR-REC-005: bỏ qua một kỳ phải có lý do. */
export function requiresSkipReason(status: ExecutionLog['status']): boolean {
  return status === 'SKIPPED';
}

/** Khoảng của kỳ chứa `date` theo chu kỳ. */
export function periodRangeFor(cycle: RecurrenceCycle, date: BusinessDate): DateRange {
  switch (cycle) {
    case 'WEEK':
      return weekRange(date);
    case 'MONTH':
      return monthRange(date);
    case 'QUARTER': {
      const [y, m] = date.split('-').map(Number);
      const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
      const endMonth = startMonth + 2;
      const end = monthRange(`${y}-${String(endMonth).padStart(2, '0')}-01`).end;
      return { start, end };
    }
    case 'YEAR': {
      const y = date.slice(0, 4);
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
  }
}

/** Nhãn kỳ để hiển thị và làm khóa chống trùng: `2026-W33`, `2026-08`, `2026-Q3`, `2026`. */
export function periodKey(cycle: RecurrenceCycle, date: BusinessDate): string {
  const [y, m] = date.split('-');
  switch (cycle) {
    case 'WEEK': {
      const start = weekRange(date).start;
      const jan1 = `${start.slice(0, 4)}-01-01`;
      const dayDiff = Math.round(
        (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${jan1}T00:00:00Z`)) / 86_400_000,
      );
      const week = Math.floor(dayDiff / 7) + 1;
      return `${start.slice(0, 4)}-W${String(week).padStart(2, '0')}`;
    }
    case 'MONTH':
      return `${y}-${m}`;
    case 'QUARTER':
      return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
    case 'YEAR':
      return y;
  }
}

/** Kỳ kế tiếp sau `date`. */
export function nextPeriodStart(cycle: RecurrenceCycle, date: BusinessDate): BusinessDate {
  return addDays(periodRangeFor(cycle, date).end, 1);
}

/**
 * BR-REC-003: on-time khi `completed_at ≤ occurrence_due_at`.
 * Không có hạn kỳ ⇒ `NO_DEADLINE` (đừng tính vào tỷ lệ đúng hạn).
 */
export function evaluateOccurrenceDeadline(
  log: Pick<ExecutionLog, 'status' | 'completed_at' | 'occurrence_due_at'>,
): DeadlineResult | null {
  if (log.status !== 'COMPLETED') return null;
  if (!log.occurrence_due_at) return 'NO_DEADLINE';
  if (!log.completed_at) return null;
  return log.completed_at <= log.occurrence_due_at ? 'ON_TIME' : 'LATE';
}

export interface ExecutionSummary {
  total: number;
  completed: number;
  on_time: number;
  late: number;
  in_progress: number;
  not_done: number;
  skipped: number;
  actual_hours: number;
  /** `null` khi mẫu số = 0 — UI hiển thị “—”, **không** hiển thị 0% (guideline 11.2). */
  on_time_rate: number | null;
  /** Mẫu số của `on_time_rate`, luôn hiển thị kèm để truy vết. */
  on_time_denominator: number;
}

/**
 * BR-REC-004: `actual_hours` chỉ cộng từ log **trong kỳ**.
 */
export function summarizeExecutionLogs(
  logs: readonly ExecutionLog[],
  range: DateRange,
): ExecutionSummary {
  const inRange = logs.filter(
    (l) => isWithin(l.period_start, range) || isWithin(l.completed_at ?? '', range),
  );

  let completed = 0;
  let onTime = 0;
  let late = 0;
  let inProgress = 0;
  let notDone = 0;
  let skipped = 0;
  let actualHours = 0;

  for (const log of inRange) {
    actualHours += log.actual_hours ?? 0;
    switch (log.status) {
      case 'COMPLETED': {
        completed += 1;
        const result = log.deadline_result ?? evaluateOccurrenceDeadline(log);
        if (result === 'ON_TIME') onTime += 1;
        else if (result === 'LATE') late += 1;
        break;
      }
      case 'IN_PROGRESS':
        inProgress += 1;
        break;
      case 'NOT_DONE':
        notDone += 1;
        break;
      case 'SKIPPED':
        skipped += 1; // BR-REC-005: không tính là completed/on-time
        break;
    }
  }

  const denominator = onTime + late;

  return {
    total: inRange.length,
    completed,
    on_time: onTime,
    late,
    in_progress: inProgress,
    not_done: notDone,
    skipped,
    actual_hours: Math.round(actualHours * 10) / 10,
    on_time_rate: denominator > 0 ? Math.round((onTime / denominator) * 1000) / 10 : null,
    on_time_denominator: denominator,
  };
}

/**
 * Kỳ đang tới hạn mà chưa có log — dùng cho “Định kỳ đến kỳ” ở My Work và thông báo.
 */
export function isOccurrenceDue(
  item: Pick<WorkItem, 'schedule_type' | 'recurrence_rule'>,
  logs: readonly ExecutionLog[],
  today: BusinessDate,
): boolean {
  if (item.schedule_type !== 'RECURRING' || !item.recurrence_rule) return false;
  const range = periodRangeFor(item.recurrence_rule, today);
  return !logs.some(
    (l) => l.period_start >= range.start && l.period_start <= range.end && l.status !== 'NOT_DONE',
  );
}
