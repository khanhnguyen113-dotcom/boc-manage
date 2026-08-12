/**
 * Tính lại toàn bộ giá trị derived của cây công việc — BR-PRO-006.
 *
 * Hàm thuần: nhận danh sách `WorkItem`, trả về danh sách đã cập nhật + tập id thay đổi.
 * Duyệt **post-order** nên con luôn xong trước cha; chạy lại nhiều lần cho cùng đầu vào
 * ra cùng kết quả (idempotent), phục vụ job nền và script đối soát sau import.
 */

import { childBaselineWarnings, computeDisplayDates } from './dates';
import { evaluateDataQuality } from './data-quality';
import { buildTreeIndex, computeIsLeaf, postOrder, type TreeIndex } from './hierarchy';
import {
  computeEffectiveEstimatedHours,
  computeEffectiveProgress,
  type ProgressContext,
  type ProgressRollupMode,
} from './progress';
import type { CategoryCode, WorkItem } from './types';

export interface RecalcOptions {
  /** Mã L2 của từng công việc — cần cho BR-PRO-004. */
  categoryCodeOf: (item: WorkItem) => CategoryCode | null;
  /** ADR-008, mặc định `average`. */
  mode?: ProgressRollupMode;
  /** Công việc có tệp kết quả (id set) — ảnh hưởng `MISSING_RESULT_EVIDENCE`. */
  itemsWithResultAttachment?: ReadonlySet<string>;
}

export interface RecalcResult {
  items: WorkItem[];
  changedIds: Set<string>;
  tree: TreeIndex;
}

/** So sánh nông các trường derived để biết row có cần ghi lại không. */
function derivedEquals(a: WorkItem, b: WorkItem): boolean {
  return (
    a.is_leaf === b.is_leaf &&
    a.effective_progress === b.effective_progress &&
    a.effective_estimated_hours === b.effective_estimated_hours &&
    a.display_start === b.display_start &&
    a.display_end === b.display_end &&
    a.data_quality_status === b.data_quality_status &&
    a.data_quality_codes.length === b.data_quality_codes.length &&
    a.data_quality_codes.every((c, i) => c === b.data_quality_codes[i])
  );
}

/**
 * Tính lại cho toàn bộ tập truyền vào.
 *
 * Lưu ý: phải truyền **đủ cây** của những node cần tính (thường là toàn bộ `root_id` liên quan),
 * nếu không giá trị cuộn lên sẽ thiếu con.
 */
export function recalculateTree(input: readonly WorkItem[], options: RecalcOptions): RecalcResult {
  // Bản sao nông để không mutate đầu vào của caller.
  const working = input.map((item) => ({ ...item, data_quality_codes: [...item.data_quality_codes] }));
  const tree = buildTreeIndex(working);
  const changedIds = new Set<string>();

  const ctx: ProgressContext = {
    categoryOf: options.categoryCodeOf,
    mode: options.mode ?? 'average',
  };

  for (const node of postOrder(tree)) {
    const before = { ...node, data_quality_codes: [...node.data_quality_codes] };

    // 1. leaf trước — nhiều rule khác phụ thuộc.
    node.is_leaf = computeIsLeaf(tree, node.id);

    // 2. tiến độ & khối lượng cuộn lên.
    const progress = computeEffectiveProgress(node, tree, ctx);
    node.effective_progress = progress.value;
    node.effective_estimated_hours = computeEffectiveEstimatedHours(node, tree);

    // 3. ngày hiển thị (baseline không bị sửa — BR-DAT-001).
    const display = computeDisplayDates(node, tree);
    node.display_start = display.display_start;
    node.display_end = display.display_end;

    // 4. chất lượng dữ liệu, sau khi đã có derived.
    const quality = evaluateDataQuality(node, tree, {
      hasResultAttachment: options.itemsWithResultAttachment?.has(node.id) ?? false,
      hasChildOutsideBaseline: childBaselineWarnings(node, tree).length > 0,
    });
    node.data_quality_status = quality.status;
    node.data_quality_codes = quality.codes;

    if (!derivedEquals(before, node)) changedIds.add(node.id);
  }

  return { items: working, changedIds, tree };
}

/**
 * Tính lại cho các cây chứa `affectedIds` — dùng sau mỗi mutation.
 * Trả về danh sách **toàn bộ** item của các cây đó đã cập nhật, cùng tập id thay đổi thật.
 */
export function recalculateAffected(
  all: readonly WorkItem[],
  affectedIds: readonly string[],
  options: RecalcOptions,
): RecalcResult {
  const byId = new Map(all.map((i) => [i.id, i]));
  const rootIds = new Set<string>();
  for (const id of affectedIds) {
    const item = byId.get(id);
    if (item) rootIds.add(item.root_id);
  }
  if (rootIds.size === 0) {
    return { items: [], changedIds: new Set(), tree: buildTreeIndex([]) };
  }
  const subset = all.filter((i) => rootIds.has(i.root_id));
  return recalculateTree(subset, options);
}
