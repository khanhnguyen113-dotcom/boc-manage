/**
 * Tải nguồn lực và công suất — BR-LOD-001…006.
 *
 * Nguyên tắc quan trọng nhất (guideline 1.4 + 6.5): **không kết luận “nhàn/quá tải” khi thiếu
 * dữ liệu**. Thiếu một trong ba tham số (tổng giờ, đơn vị phân bổ, giờ/kỳ) ⇒ trạng thái
 * `INSUFFICIENT_DATA`, không phải “bình thường”.
 */

import { countBusinessDays, rangesOverlap, type BusinessCalendar, type DateRange } from './business-days';
import { remainingHours } from './progress';
import type { BusinessDate, WorkItem } from './types';

export type LoadState = 'INSUFFICIENT_DATA' | 'NORMAL' | 'NEAR_CAPACITY' | 'OVER_CAPACITY';

export const LOAD_STATE_LABELS: Record<LoadState, string> = {
  INSUFFICIENT_DATA: 'Chưa đủ dữ liệu',
  NORMAL: 'Bình thường',
  NEAR_CAPACITY: 'Cận tải',
  OVER_CAPACITY: 'Quá tải',
};

export interface CapacityConfig {
  /** Công suất mặc định hệ thống (Sheet: 8.0 giờ/ngày). */
  defaultHoursPerDay: number;
  /**
   * Số ngày quy đổi khi phân bổ theo tuần. Sheet dùng 5 dù business week là 6 ngày —
   * mâu thuẫn đã ghi ở NEED_CONFIRMATION B3.
   */
  capacityDaysPerWeek: number;
  /** Ngưỡng cận tải, 0–1. Sheet: danh mục 0.80, báo cáo 0.85 (NEED_CONFIRMATION B4). */
  nearCapacityThreshold: number;
}

export const DEFAULT_CAPACITY: CapacityConfig = {
  defaultHoursPerDay: 8,
  capacityDaysPerWeek: 5,
  nearCapacityThreshold: 0.85,
};

export type LoadDataGap =
  | 'MISSING_ESTIMATED_HOURS'
  | 'MISSING_ALLOCATION_UNIT'
  | 'MISSING_ALLOCATION_HOURS'
  | 'ALLOCATION_NON_POSITIVE';

export interface ItemLoad {
  work_item_id: string;
  code: string;
  /** Giờ/ngày đã quy đổi từ phân bổ cam kết. `null` nếu thiếu tham số. */
  daily_load: number | null;
  /** Giờ/ngày cần thiết để kịp hạn: giờ còn lại ÷ số ngày làm việc còn lại. */
  required_daily: number | null;
  remaining_hours: number | null;
  remaining_business_days: number | null;
  gaps: LoadDataGap[];
}

/**
 * BR-LOD-002: quy đổi phân bổ cam kết về giờ/ngày.
 * `DAY` → dùng thẳng; `WEEK` → chia `capacityDaysPerWeek`.
 */
export function toDailyLoad(
  allocationHours: number | null | undefined,
  allocationUnit: 'DAY' | 'WEEK' | null | undefined,
  config: CapacityConfig,
): number | null {
  if (allocationHours === null || allocationHours === undefined) return null;
  if (!Number.isFinite(allocationHours) || allocationHours <= 0) return null;
  if (!allocationUnit) return null;
  const value =
    allocationUnit === 'DAY'
      ? allocationHours
      : allocationHours / Math.max(1, config.capacityDaysPerWeek);
  return Math.round(value * 100) / 100;
}

/** BR-LOD-004: liệt kê tham số còn thiếu — cơ sở để gắn `INSUFFICIENT_DATA`. */
export function loadDataGaps(item: WorkItem): LoadDataGap[] {
  const gaps: LoadDataGap[] = [];
  if (item.effective_estimated_hours === null || item.effective_estimated_hours === undefined) {
    gaps.push('MISSING_ESTIMATED_HOURS');
  }
  if (!item.allocation_unit) gaps.push('MISSING_ALLOCATION_UNIT');
  if (item.allocation_hours === null || item.allocation_hours === undefined) {
    gaps.push('MISSING_ALLOCATION_HOURS');
  } else if (item.allocation_hours <= 0) {
    gaps.push('ALLOCATION_NON_POSITIVE');
  }
  return gaps;
}

/**
 * BR-LOD-003: tải của một công việc trong bối cảnh ngày hiện tại.
 */
export function computeItemLoad(
  item: WorkItem,
  today: BusinessDate,
  cal: BusinessCalendar,
  config: CapacityConfig,
): ItemLoad {
  const gaps = loadDataGaps(item);
  const remaining = remainingHours(item);
  const end = item.display_end ?? item.planned_end;

  const remainingDays = end && end >= today ? countBusinessDays(today, end, cal) : end ? 0 : null;

  const requiredDaily =
    remaining === null || remainingDays === null
      ? null
      : Math.round((remaining / Math.max(1, remainingDays)) * 100) / 100;

  return {
    work_item_id: item.id,
    code: item.code,
    daily_load: toDailyLoad(item.allocation_hours, item.allocation_unit, config),
    required_daily: requiredDaily,
    remaining_hours: remaining,
    remaining_business_days: remainingDays,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// Tải theo người
// ---------------------------------------------------------------------------

export interface PersonLoad {
  user_id: string;
  capacity_hours_per_day: number;
  /** Tổng giờ/ngày cam kết của các việc lá đang chạy giao cắt khoảng đánh giá. */
  planned_daily: number;
  /** Tổng giờ/ngày *cần* để kịp hạn. */
  required_daily: number;
  /** % công suất theo phân bổ cam kết. */
  utilization: number;
  state: LoadState;
  item_count: number;
  /** Số việc thiếu tham số ⇒ lý do không kết luận được. */
  items_with_gaps: number;
  overdue_remaining_hours: number;
}

export interface PersonLoadInput {
  user_id: string;
  capacityHoursPerDay: number;
  /** Các việc **lá đang hoạt động** được giao cho người này. */
  items: readonly WorkItem[];
}

/**
 * BR-LOD-005/006: tổng tải của một người trong khoảng đánh giá.
 *
 * Chỉ cộng việc lá (guideline mục 10: “workload mặc định tính leaf”) có khoảng thời gian giao với
 * `range`. Nếu **bất kỳ** việc nào thiếu tham số, trạng thái trả về là `INSUFFICIENT_DATA` — đúng
 * tinh thần “không kết luận trên dữ liệu thiếu”.
 */
export function computePersonLoad(
  input: PersonLoadInput,
  range: DateRange,
  today: BusinessDate,
  cal: BusinessCalendar,
  config: CapacityConfig,
): PersonLoad {
  let plannedDaily = 0;
  let requiredDaily = 0;
  let itemsWithGaps = 0;
  let overdueRemaining = 0;
  let counted = 0;

  for (const item of input.items) {
    if (item.is_archived) continue;
    if (item.status === 'COMPLETED' || item.status === 'CANCELLED') continue;
    if (!item.is_leaf) continue;

    const start = item.display_start ?? item.planned_start;
    const end = item.display_end ?? item.planned_end;
    // Việc chưa xếp lịch không có khoảng thời gian ⇒ không tính vào tải của kỳ.
    if (!rangesOverlap(start, end, range)) continue;

    counted += 1;
    const load = computeItemLoad(item, today, cal, config);
    if (load.gaps.length > 0) itemsWithGaps += 1;
    if (load.daily_load !== null) plannedDaily += load.daily_load;
    if (load.required_daily !== null) requiredDaily += load.required_daily;
    if (end && end < today && load.remaining_hours) overdueRemaining += load.remaining_hours;
  }

  const capacity = input.capacityHoursPerDay > 0 ? input.capacityHoursPerDay : config.defaultHoursPerDay;
  const utilization = capacity > 0 ? plannedDaily / capacity : 0;

  const state: LoadState =
    counted === 0
      ? 'INSUFFICIENT_DATA'
      : itemsWithGaps > 0
        ? 'INSUFFICIENT_DATA'
        : classifyLoad(utilization, config);

  return {
    user_id: input.user_id,
    capacity_hours_per_day: capacity,
    planned_daily: Math.round(plannedDaily * 100) / 100,
    required_daily: Math.round(requiredDaily * 100) / 100,
    utilization: Math.round(utilization * 1000) / 1000,
    state,
    item_count: counted,
    items_with_gaps: itemsWithGaps,
    overdue_remaining_hours: Math.round(overdueRemaining * 10) / 10,
  };
}

/**
 * Ngưỡng theo Sheet (báo cáo ngày/tuần/tháng):
 * `≤ threshold` Bình thường · `threshold–100%` Cận tải · `> 100%` Quá tải.
 */
export function classifyLoad(utilization: number, config: CapacityConfig): LoadState {
  if (!Number.isFinite(utilization)) return 'INSUFFICIENT_DATA';
  if (utilization > 1) return 'OVER_CAPACITY';
  if (utilization >= config.nearCapacityThreshold) return 'NEAR_CAPACITY';
  return 'NORMAL';
}

/** BR-LOD-006: công suất cá nhân → đơn vị → mặc định hệ thống. */
export function resolveCapacity(
  userOverride: number | null | undefined,
  unitOverride: number | null | undefined,
  config: CapacityConfig,
): number {
  if (typeof userOverride === 'number' && userOverride > 0) return userOverride;
  if (typeof unitOverride === 'number' && unitOverride > 0) return unitOverride;
  return config.defaultHoursPerDay;
}
