/**
 * Lịch nghiệp vụ: ngày làm việc, ngày nghỉ, quá hạn, “còn N ngày”.
 *
 * Guideline 8.5 / 8.6. Toàn bộ hàm ở đây nhận lịch làm việc là **tham số tường minh**
 * — không đọc env, không gọi `new Date()` — để test được ở biên (hôm nay, Chủ nhật,
 * ngày lễ, cuối năm).
 *
 * Mâu thuẫn nguồn đã ghi nhận (NEED_CONFIRMATION B2/B3): Sheet dùng
 * `NETWORKDAYS.INTL(...;11;holidays)` — loại **Chủ nhật**, giữ thứ Bảy (6 ngày/tuần) —
 * nhưng công thức tải lại quy đổi tuần chia **5**. Ở đây tách thành hai tham số độc lập:
 * `workWeekMask` (đếm deadline) và `capacityDaysPerWeek` (quy đổi tải).
 */

import type { BusinessDate } from './types';

/** Bit theo `Date.getUTCDay()`: 0 = Chủ nhật … 6 = Thứ Bảy. */
export type WorkWeekMask = readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

/** Thứ 2 → Thứ 7 là ngày làm việc, loại Chủ nhật. Khớp `NETWORKDAYS.INTL(...;11;...)`. */
export const MASK_MON_SAT: WorkWeekMask = [false, true, true, true, true, true, true];

/** Thứ 2 → Thứ 6. */
export const MASK_MON_FRI: WorkWeekMask = [false, true, true, true, true, true, false];

export const WORK_WEEK_MASKS = {
  MON_SAT: MASK_MON_SAT,
  MON_FRI: MASK_MON_FRI,
} as const;

export type WorkWeekMaskName = keyof typeof WORK_WEEK_MASKS;

export interface BusinessCalendar {
  mask: WorkWeekMask;
  /** Tập ngày nghỉ dạng `YYYY-MM-DD`. */
  holidays: ReadonlySet<BusinessDate>;
}

export function createCalendar(
  mask: WorkWeekMask,
  holidays: Iterable<BusinessDate> = [],
): BusinessCalendar {
  return { mask, holidays: new Set(holidays) };
}

// ---------------------------------------------------------------------------
// Số học ngày, giữ nguyên dạng chuỗi YYYY-MM-DD (không dính timezone)
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBusinessDateString(value: unknown): value is BusinessDate {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(toUtc(value).getTime());
}

/** Chuỗi `YYYY-MM-DD` → `Date` tại 00:00 UTC. Chỉ dùng nội bộ để cộng/trừ ngày. */
function toUtc(date: BusinessDate): Date {
  const m = DATE_RE.exec(date);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtc(d: Date): BusinessDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Số ngày lịch giữa hai mốc (b − a). */
export function diffCalendarDays(a: BusinessDate, b: BusinessDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function compareDates(a: BusinessDate, b: BusinessDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(...dates: (BusinessDate | null | undefined)[]): BusinessDate | null {
  const valid = dates.filter(isBusinessDateString);
  return valid.length ? valid.reduce((m, d) => (d < m ? d : m)) : null;
}

export function maxDate(...dates: (BusinessDate | null | undefined)[]): BusinessDate | null {
  const valid = dates.filter(isBusinessDateString);
  return valid.length ? valid.reduce((m, d) => (d > m ? d : m)) : null;
}

// ---------------------------------------------------------------------------
// Ngày làm việc
// ---------------------------------------------------------------------------

export function isWorkingDay(date: BusinessDate, cal: BusinessCalendar): boolean {
  if (!isBusinessDateString(date)) return false;
  if (cal.holidays.has(date)) return false;
  return cal.mask[toUtc(date).getUTCDay()];
}

/**
 * Đếm ngày làm việc trong `[from, to]` — **bao gồm cả hai đầu**, giống `NETWORKDAYS.INTL`.
 * Trả 0 nếu `to < from`.
 */
export function countBusinessDays(
  from: BusinessDate,
  to: BusinessDate,
  cal: BusinessCalendar,
): number {
  if (!isBusinessDateString(from) || !isBusinessDateString(to)) return 0;
  if (to < from) return 0;
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWorkingDay(d, cal)) count += 1;
  }
  return count;
}

/** Cộng thêm `n` ngày làm việc kể từ `date` (không tính chính `date`). */
export function addBusinessDays(date: BusinessDate, n: number, cal: BusinessCalendar): BusinessDate {
  let remaining = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  let cursor = date;
  while (remaining > 0) {
    cursor = addDays(cursor, step);
    if (isWorkingDay(cursor, cal)) remaining -= 1;
  }
  return cursor;
}

/**
 * Số ngày làm việc còn lại tới hạn — cột “Ngày làm việc còn lại” của Sheet.
 *
 * - `> 0`: còn hạn, đếm cả ngày kết thúc.
 * - `0`  : hết ngày làm việc khả dụng (đến hạn hoặc hạn rơi vào ngày nghỉ).
 * - `< 0`: quá hạn — âm bằng số ngày làm việc đã trôi qua kể từ sau hạn.
 */
export function businessDaysLeft(
  today: BusinessDate,
  end: BusinessDate | null,
  cal: BusinessCalendar,
): number | null {
  if (!end || !isBusinessDateString(end)) return null;
  if (end >= today) return countBusinessDays(today, end, cal);
  return -countBusinessDays(addDays(end, 1), today, cal);
}

// ---------------------------------------------------------------------------
// Kỳ báo cáo
// ---------------------------------------------------------------------------

export interface DateRange {
  /** Bao gồm. */
  start: BusinessDate;
  /** Bao gồm. */
  end: BusinessDate;
}

export function dayRange(date: BusinessDate): DateRange {
  return { start: date, end: date };
}

/** Tuần bắt đầu **Thứ Hai** (chuẩn VN). */
export function weekRange(date: BusinessDate): DateRange {
  const dow = toUtc(date).getUTCDay(); // 0 = CN
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const start = addDays(date, -backToMonday);
  return { start, end: addDays(start, 6) };
}

export function monthRange(date: BusinessDate): DateRange {
  const d = toUtc(date);
  const start = fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const end = fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { start, end };
}

export function yearRange(year: number): DateRange {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function isWithin(date: BusinessDate | null | undefined, range: DateRange): boolean {
  if (!date || !isBusinessDateString(date)) return false;
  return date >= range.start && date <= range.end;
}

export function eachDay(range: DateRange): BusinessDate[] {
  const out: BusinessDate[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Hai khoảng có giao nhau không (dùng cho tải theo khoảng đánh giá — BR-LOD-005). */
export function rangesOverlap(
  aStart: BusinessDate | null,
  aEnd: BusinessDate | null,
  range: DateRange,
): boolean {
  const start = aStart ?? aEnd;
  const end = aEnd ?? aStart;
  if (!start || !end) return false;
  return start <= range.end && end >= range.start;
}

// ---------------------------------------------------------------------------
// Định dạng hiển thị (dd/MM/yyyy — guideline 13.7)
// ---------------------------------------------------------------------------

export function formatDate(date: BusinessDate | null | undefined): string {
  if (!date || !isBusinessDateString(date)) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateRange(range: DateRange): string {
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

export function formatMonth(date: BusinessDate): string {
  const [y, m] = date.split('-');
  return `${m}/${y}`;
}
