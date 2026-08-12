/**
 * Ngày kế hoạch gốc vs ngày hiển thị — BR-DAT-001…007.
 *
 * Nguyên tắc từ Sheet (“NGUYÊN TẮC NGÀY CHA – CON”):
 * - Việc thường: ngày hiển thị của cha **giữ kế hoạch gốc**, chỉ nới rộng khi con bắt đầu sớm hơn
 *   hoặc kết thúc muộn hơn.
 * - Việc phát sinh (`AD_HOC`) có con: ngày cha = min/max của con; chưa có con thì để trống.
 * - Con vượt khung kế hoạch gốc ⇒ **cảnh báo**, hệ thống **không tự sửa** ngày gốc.
 */

import { compareDates, isBusinessDateString, maxDate, minDate } from './business-days';
import { activeChildren, type TreeIndex } from './hierarchy';
import type { BusinessDate, WorkItem } from './types';

export interface DisplayDates {
  display_start: BusinessDate | null;
  display_end: BusinessDate | null;
}

/**
 * BR-DAT-002/003/004. Yêu cầu `display_start/end` của các con **đã tính xong** (post-order).
 */
export function computeDisplayDates(item: WorkItem, tree: TreeIndex): DisplayDates {
  const children = activeChildren(tree, item.id);

  if (children.length === 0) {
    // BR-DAT-002: không có con ⇒ hiển thị = kế hoạch gốc.
    return { display_start: item.planned_start, display_end: item.planned_end };
  }

  const childStart = minDate(...children.map((c) => c.display_start ?? c.planned_start));
  const childEnd = maxDate(...children.map((c) => c.display_end ?? c.planned_end));

  if (item.schedule_type === 'AD_HOC') {
    // BR-DAT-004: việc phát sinh có con ⇒ hoàn toàn theo con.
    return { display_start: childStart, display_end: childEnd };
  }

  // BR-DAT-003: giữ baseline, chỉ nới rộng.
  return {
    display_start: minDate(item.planned_start, childStart),
    display_end: maxDate(item.planned_end, childEnd),
  };
}

export type DateWarningCode =
  | 'CHILD_STARTS_BEFORE_PARENT'
  | 'CHILD_ENDS_AFTER_PARENT'
  | 'END_BEFORE_START'
  | 'MISSING_DATES';

export interface DateWarning {
  code: DateWarningCode;
  message: string;
  /** Node gây ra cảnh báo (con), nếu có. */
  related_work_item_id?: string;
  related_code?: string;
}

/** BR-DAT-006: hạn kết thúc trước ngày bắt đầu là dữ liệu sai, không được lưu. */
export function endBeforeStart(
  start: BusinessDate | null | undefined,
  end: BusinessDate | null | undefined,
): boolean {
  if (!isBusinessDateString(start) || !isBusinessDateString(end)) return false;
  return compareDates(end, start) < 0;
}

/**
 * BR-DAT-005: con vượt khung kế hoạch gốc của cha ⇒ cảnh báo, **không** tự sửa baseline.
 */
export function childBaselineWarnings(item: WorkItem, tree: TreeIndex): DateWarning[] {
  const warnings: DateWarning[] = [];
  if (item.schedule_type === 'AD_HOC') return warnings; // baseline theo con, không cảnh báo

  for (const child of activeChildren(tree, item.id)) {
    const childStart = child.display_start ?? child.planned_start;
    const childEnd = child.display_end ?? child.planned_end;

    if (
      isBusinessDateString(item.planned_start) &&
      isBusinessDateString(childStart) &&
      compareDates(childStart, item.planned_start) < 0
    ) {
      warnings.push({
        code: 'CHILD_STARTS_BEFORE_PARENT',
        message: `${child.code} bắt đầu trước khung kế hoạch gốc của công việc cha.`,
        related_work_item_id: child.id,
        related_code: child.code,
      });
    }

    if (
      isBusinessDateString(item.planned_end) &&
      isBusinessDateString(childEnd) &&
      compareDates(childEnd, item.planned_end) > 0
    ) {
      warnings.push({
        code: 'CHILD_ENDS_AFTER_PARENT',
        message: `${child.code} kết thúc sau khung kế hoạch gốc của công việc cha.`,
        related_work_item_id: child.id,
        related_code: child.code,
      });
    }
  }

  return warnings;
}

/**
 * Quá hạn — guideline 8.6.
 *
 * ```
 * is_overdue = schedule_type = DEADLINE
 *           AND status NOT IN (COMPLETED, CANCELLED)
 *           AND display_end < business_date
 * ```
 */
export function isOverdue(item: WorkItem, today: BusinessDate): boolean {
  if (item.schedule_type !== 'DEADLINE') return false;
  if (item.status === 'COMPLETED' || item.status === 'CANCELLED') return false;
  if (item.is_archived) return false;
  const end = item.display_end ?? item.planned_end;
  if (!isBusinessDateString(end)) return false;
  return compareDates(end, today) < 0;
}

/** Hoàn thành đúng hạn — guideline 11.2. `null` khi không có deadline để so. */
export function completedOnTime(item: WorkItem): boolean | null {
  if (item.status !== 'COMPLETED') return null;
  const end = item.display_end ?? item.planned_end;
  if (!isBusinessDateString(end) || !isBusinessDateString(item.completed_at)) return null;
  return compareDates(item.completed_at, end) <= 0;
}
