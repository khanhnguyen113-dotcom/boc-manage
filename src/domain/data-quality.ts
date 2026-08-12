/**
 * Chất lượng dữ liệu — guideline 8.9.
 *
 * Đây là “ô màu vàng” của Sheet, chuẩn hóa thành mã lỗi có thể lọc, đếm và giao việc sửa.
 * Phân biệt rõ:
 * - `INVALID` — dữ liệu **sai** (mâu thuẫn logic), phải sửa trước khi tin bất kỳ báo cáo nào.
 * - `INCOMPLETE` — dữ liệu **thiếu**, chưa đủ để kết luận tải/tiến độ.
 * - `VALID` — đủ điều kiện đưa vào kết luận quản trị.
 */

import { endBeforeStart } from './dates';
import { activeChildren, requiredParentLevel, type TreeIndex } from './hierarchy';
import type { DataQualityStatus, WorkItem } from './types';

export const DATA_QUALITY_CODES = [
  'MISSING_STATUS',
  'MISSING_TITLE',
  'MISSING_PARENT',
  'INVALID_PARENT_LEVEL',
  'MISSING_ASSIGNEE',
  'MISSING_DATES',
  'END_BEFORE_START',
  'MISSING_ESTIMATED_HOURS',
  'MISSING_ALLOCATION',
  'ALLOCATION_NON_POSITIVE',
  'MISSING_COMPLETED_AT',
  'COMPLETED_PROGRESS_NOT_100',
  'MISSING_RESULT_EVIDENCE',
  'CHILD_OUTSIDE_PARENT_BASELINE',
  'PROGRESS_ON_NON_LEAF',
  'ORPHAN_REFERENCE',
  'MISSING_EXPECTED_OUTPUT',
  'MISSING_PRIORITY',
] as const;

export type DataQualityCode = (typeof DATA_QUALITY_CODES)[number];

/** Lỗi `INVALID` chặn record khỏi kết luận quản trị và khỏi import production. */
const INVALID_CODES: ReadonlySet<DataQualityCode> = new Set([
  'MISSING_STATUS',
  'MISSING_TITLE',
  'MISSING_PARENT',
  'INVALID_PARENT_LEVEL',
  'END_BEFORE_START',
  'COMPLETED_PROGRESS_NOT_100',
  'PROGRESS_ON_NON_LEAF',
  'ORPHAN_REFERENCE',
  'ALLOCATION_NON_POSITIVE',
]);

export const DATA_QUALITY_LABELS: Record<DataQualityCode, string> = {
  MISSING_STATUS: 'Thiếu trạng thái',
  MISSING_TITLE: 'Thiếu tên công việc',
  MISSING_PARENT: 'Thiếu công việc cha',
  INVALID_PARENT_LEVEL: 'Cấp công việc cha không hợp lệ',
  MISSING_ASSIGNEE: 'Thiếu người thực hiện',
  MISSING_DATES: 'Thiếu ngày bắt đầu/kết thúc',
  END_BEFORE_START: 'Ngày kết thúc trước ngày bắt đầu',
  MISSING_ESTIMATED_HOURS: 'Thiếu khối lượng giờ',
  MISSING_ALLOCATION: 'Thiếu tham số phân bổ',
  ALLOCATION_NON_POSITIVE: 'Phân bổ không hợp lệ (≤ 0)',
  MISSING_COMPLETED_AT: 'Thiếu ngày hoàn thành thực tế',
  COMPLETED_PROGRESS_NOT_100: 'Hoàn thành nhưng tiến độ chưa đủ 100%',
  MISSING_RESULT_EVIDENCE: 'Thiếu bằng chứng kết quả',
  CHILD_OUTSIDE_PARENT_BASELINE: 'Công việc con vượt khung kế hoạch gốc',
  PROGRESS_ON_NON_LEAF: 'Nhập tiến độ thủ công ở công việc không phải điểm cuối',
  ORPHAN_REFERENCE: 'Tham chiếu công việc cha không tồn tại',
  MISSING_EXPECTED_OUTPUT: 'Thiếu kết quả đầu ra',
  MISSING_PRIORITY: 'Thiếu mức độ ưu tiên',
};

export interface DataQualityResult {
  status: DataQualityStatus;
  codes: DataQualityCode[];
}

export interface DataQualityOptions {
  /** Có ít nhất một tệp kết quả gắn với công việc. */
  hasResultAttachment?: boolean;
  /** Cảnh báo con vượt baseline — tính sẵn ở `dates.childBaselineWarnings`. */
  hasChildOutsideBaseline?: boolean;
}

/**
 * Đánh giá một công việc. Cần `tree` để biết node có con hay không.
 */
export function evaluateDataQuality(
  item: WorkItem,
  tree: TreeIndex,
  options: DataQualityOptions = {},
): DataQualityResult {
  const codes: DataQualityCode[] = [];
  const children = activeChildren(tree, item.id);
  const isLeaf = children.length === 0;

  // --- cấu trúc ---------------------------------------------------------
  if (!item.title?.trim()) codes.push('MISSING_TITLE');
  if (!item.status) codes.push('MISSING_STATUS');

  const expectedParentLevel = requiredParentLevel(item.level);
  if (expectedParentLevel !== null) {
    if (!item.parent_id) codes.push('MISSING_PARENT');
    else {
      const parent = tree.byId.get(item.parent_id);
      if (!parent) codes.push('ORPHAN_REFERENCE');
      else if (parent.level !== expectedParentLevel) codes.push('INVALID_PARENT_LEVEL');
    }
  }

  // Việc đã hủy/lưu trữ không cần đủ dữ liệu vận hành.
  if (item.status === 'CANCELLED' || item.is_archived) {
    return { status: codes.length ? classify(codes) : 'VALID', codes };
  }

  // --- trách nhiệm ------------------------------------------------------
  if (isLeaf && !item.primary_assignee_id) codes.push('MISSING_ASSIGNEE');
  if (!item.priority) codes.push('MISSING_PRIORITY');

  // --- kế hoạch ---------------------------------------------------------
  if (item.schedule_type === 'DEADLINE') {
    if (!item.planned_start || !item.planned_end) codes.push('MISSING_DATES');
  }
  if (endBeforeStart(item.planned_start, item.planned_end)) codes.push('END_BEFORE_START');
  if (options.hasChildOutsideBaseline) codes.push('CHILD_OUTSIDE_PARENT_BASELINE');

  // --- nguồn lực (chỉ yêu cầu ở điểm cuối) ------------------------------
  if (isLeaf && item.schedule_type !== 'UNSCHEDULED') {
    if (item.estimated_hours_input === null || item.estimated_hours_input === undefined) {
      codes.push('MISSING_ESTIMATED_HOURS');
    }
    if (!item.allocation_unit || item.allocation_hours === null || item.allocation_hours === undefined) {
      codes.push('MISSING_ALLOCATION');
    } else if (item.allocation_hours <= 0) {
      codes.push('ALLOCATION_NON_POSITIVE');
    }
  }

  // --- thực hiện --------------------------------------------------------
  if (!isLeaf && item.manual_progress !== null && item.manual_progress !== undefined) {
    codes.push('PROGRESS_ON_NON_LEAF'); // BR-PRO-001
  }

  if (item.status === 'COMPLETED') {
    if (!item.completed_at) codes.push('MISSING_COMPLETED_AT');
    if ((item.effective_progress ?? 0) < 100) codes.push('COMPLETED_PROGRESS_NOT_100');
    if (!item.expected_output?.trim()) codes.push('MISSING_EXPECTED_OUTPUT');
    if (!item.result_link?.trim() && !options.hasResultAttachment) {
      codes.push('MISSING_RESULT_EVIDENCE');
    }
  }

  return { status: classify(codes), codes };
}

function classify(codes: DataQualityCode[]): DataQualityStatus {
  if (codes.length === 0) return 'VALID';
  return codes.some((c) => INVALID_CODES.has(c)) ? 'INVALID' : 'INCOMPLETE';
}

export function isInvalidCode(code: DataQualityCode): boolean {
  return INVALID_CODES.has(code);
}

/** Đếm theo mã lỗi — nguồn cho bảng Data Health. */
export function tallyDataQuality(items: readonly WorkItem[]): {
  valid: number;
  incomplete: number;
  invalid: number;
  by_code: { code: DataQualityCode; label: string; count: number; severity: 'INVALID' | 'INCOMPLETE' }[];
  completeness: number | null;
} {
  let valid = 0;
  let incomplete = 0;
  let invalid = 0;
  const counts = new Map<DataQualityCode, number>();

  for (const item of items) {
    if (item.data_quality_status === 'VALID') valid += 1;
    else if (item.data_quality_status === 'INCOMPLETE') incomplete += 1;
    else invalid += 1;

    for (const raw of item.data_quality_codes) {
      const code = raw as DataQualityCode;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  const total = items.length;

  return {
    valid,
    incomplete,
    invalid,
    by_code: [...counts.entries()]
      .map(([code, count]) => ({
        code,
        label: DATA_QUALITY_LABELS[code] ?? code,
        count,
        severity: isInvalidCode(code) ? ('INVALID' as const) : ('INCOMPLETE' as const),
      }))
      .sort((a, b) => b.count - a.count),
    completeness: total > 0 ? Math.round((valid / total) * 1000) / 10 : null,
  };
}
