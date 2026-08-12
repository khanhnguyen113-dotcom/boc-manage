/**
 * Roll-up tiến độ — BR-PRO-001…006.
 *
 * Nguyên tắc gốc từ Sheet: “Chỉ nhập % tại công việc con thấp nhất”, cha lấy **trung bình**
 * các con hợp lệ, và *“Công việc khác”, “Chưa lên lịch”, “Đã lên lịch” không tính vào tiến độ
 * trung bình*.
 *
 * Mọi kết quả đều kèm `eligible`/`excluded` + lý do loại trừ, để dashboard giải thích được
 * vì sao một con số khác kỳ vọng (guideline mục 10).
 */

import {
  CATEGORIES_EXCLUDED_FROM_PROGRESS,
  PRE_EXECUTION_STATUSES,
} from './catalogs';
import { activeChildren, type TreeIndex } from './hierarchy';
import type { CategoryCode, WorkItem } from './types';

export type ProgressRollupMode = 'average' | 'weighted';

export type ProgressExclusionReason =
  | 'CANCELLED'
  | 'ARCHIVED'
  | 'PRE_EXECUTION_STATUS'
  | 'CATEGORY_EXCLUDED'
  | 'NO_PROGRESS_VALUE';

export interface ProgressExclusion {
  work_item_id: string;
  code: string;
  reason: ProgressExclusionReason;
}

export interface ProgressResult {
  /** `null` = chưa đủ căn cứ để kết luận — UI hiển thị “—”, không hiển thị 0%. */
  value: number | null;
  eligible_count: number;
  excluded_count: number;
  exclusions: ProgressExclusion[];
  source: 'MANUAL_LEAF' | 'ROLLUP_CHILDREN' | 'COMPLETED_NO_CHILD' | 'NO_DATA';
}

export interface ProgressContext {
  /** work_item_id → mã L2, để áp BR-PRO-004. */
  categoryOf: (item: WorkItem) => CategoryCode | null;
  mode?: ProgressRollupMode;
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

/**
 * BR-PRO-003 + BR-PRO-004: một con có được vào mẫu số trung bình không.
 */
export function progressExclusionFor(
  child: WorkItem,
  ctx: ProgressContext,
): ProgressExclusionReason | null {
  if (child.status === 'CANCELLED') return 'CANCELLED';
  if (child.is_archived) return 'ARCHIVED';
  if (PRE_EXECUTION_STATUSES.includes(child.status)) return 'PRE_EXECUTION_STATUS';
  const category = ctx.categoryOf(child);
  if (category && CATEGORIES_EXCLUDED_FROM_PROGRESS.includes(category)) return 'CATEGORY_EXCLUDED';
  if (child.effective_progress === null || child.effective_progress === undefined) {
    return 'NO_PROGRESS_VALUE';
  }
  return null;
}

/**
 * Tính `effective_progress` cho một node.
 *
 * Yêu cầu: `effective_progress` của **các con đã được tính xong** (duyệt post-order).
 */
export function computeEffectiveProgress(
  item: WorkItem,
  tree: TreeIndex,
  ctx: ProgressContext,
): ProgressResult {
  // BR-STA-004: việc đã hủy không mang tiến độ vào bất kỳ tổng hợp nào.
  if (item.status === 'CANCELLED') {
    return { value: null, eligible_count: 0, excluded_count: 0, exclusions: [], source: 'NO_DATA' };
  }

  const children = activeChildren(tree, item.id);

  // BR-PRO-001: chỉ leaf được nhập tay.
  if (children.length === 0) {
    if (item.status === 'COMPLETED') {
      return {
        value: 100,
        eligible_count: 0,
        excluded_count: 0,
        exclusions: [],
        source: 'COMPLETED_NO_CHILD',
      };
    }
    if (item.manual_progress === null || item.manual_progress === undefined) {
      return { value: null, eligible_count: 0, excluded_count: 0, exclusions: [], source: 'NO_DATA' };
    }
    return {
      value: clampProgress(item.manual_progress),
      eligible_count: 1,
      excluded_count: 0,
      exclusions: [],
      source: 'MANUAL_LEAF',
    };
  }

  const exclusions: ProgressExclusion[] = [];
  const eligible: WorkItem[] = [];

  for (const child of children) {
    const reason = progressExclusionFor(child, ctx);
    if (reason) exclusions.push({ work_item_id: child.id, code: child.code, reason });
    else eligible.push(child);
  }

  // BR-PRO-005: cha không có con hợp lệ.
  if (eligible.length === 0) {
    if (item.status === 'COMPLETED') {
      return {
        value: 100,
        eligible_count: 0,
        excluded_count: exclusions.length,
        exclusions,
        source: 'COMPLETED_NO_CHILD',
      };
    }
    return {
      value: null,
      eligible_count: 0,
      excluded_count: exclusions.length,
      exclusions,
      source: 'NO_DATA',
    };
  }

  const mode = ctx.mode ?? 'average';
  let value: number;

  if (mode === 'weighted') {
    // ADR-008: chỉ bật khi PO duyệt. Không có giờ thì rơi về trọng số 1 để không mất mẫu số.
    const totalWeight = eligible.reduce((s, c) => s + (c.effective_estimated_hours ?? 0), 0);
    if (totalWeight > 0) {
      value =
        eligible.reduce(
          (s, c) => s + (c.effective_progress ?? 0) * (c.effective_estimated_hours ?? 0),
          0,
        ) / totalWeight;
    } else {
      value = eligible.reduce((s, c) => s + (c.effective_progress ?? 0), 0) / eligible.length;
    }
  } else {
    // BR-PRO-002: trung bình đều — khớp `AVERAGE` của Sheet.
    value = eligible.reduce((s, c) => s + (c.effective_progress ?? 0), 0) / eligible.length;
  }

  return {
    value: clampProgress(value),
    eligible_count: eligible.length,
    excluded_count: exclusions.length,
    exclusions,
    source: 'ROLLUP_CHILDREN',
  };
}

/**
 * Tổng khối lượng giờ — BR-LOD-001.
 * Leaf: lấy `estimated_hours_input`. Cha: tổng của **hậu duệ trực tiếp đã tính xong**,
 * tránh double-count giữa cha và con (guideline mục 10).
 */
export function computeEffectiveEstimatedHours(item: WorkItem, tree: TreeIndex): number | null {
  const children = activeChildren(tree, item.id);
  if (children.length === 0) {
    return item.estimated_hours_input ?? null;
  }
  const values = children
    .map((c) => c.effective_estimated_hours)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return item.estimated_hours_input ?? null;
  return Math.round(values.reduce((s, v) => s + v, 0) * 10) / 10;
}

/**
 * Giờ còn lại — guideline 8.6.
 * `max(0, giờ × (1 − tiến độ/100))`. Thiếu giờ hoặc thiếu tiến độ ⇒ `null` (không đoán 0).
 */
export function remainingHours(item: WorkItem): number | null {
  const hours = item.effective_estimated_hours;
  const progress = item.effective_progress;
  if (hours === null || hours === undefined) return null;
  if (progress === null || progress === undefined) return Math.round(hours * 10) / 10;
  return Math.max(0, Math.round(hours * (1 - progress / 100) * 10) / 10);
}

/** Trung bình tiến độ của một tập node, áp cùng bộ loại trừ như roll-up. */
export function averageProgress(items: readonly WorkItem[], ctx: ProgressContext): ProgressResult {
  const exclusions: ProgressExclusion[] = [];
  const eligible: WorkItem[] = [];

  for (const item of items) {
    const reason = progressExclusionFor(item, ctx);
    if (reason) exclusions.push({ work_item_id: item.id, code: item.code, reason });
    else eligible.push(item);
  }

  if (eligible.length === 0) {
    return {
      value: null,
      eligible_count: 0,
      excluded_count: exclusions.length,
      exclusions,
      source: 'NO_DATA',
    };
  }

  const value =
    eligible.reduce((s, i) => s + (i.effective_progress ?? 0), 0) / eligible.length;

  return {
    value: clampProgress(value),
    eligible_count: eligible.length,
    excluded_count: exclusions.length,
    exclusions,
    source: 'ROLLUP_CHILDREN',
  };
}
