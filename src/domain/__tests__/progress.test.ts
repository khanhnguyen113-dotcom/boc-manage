import { describe, expect, it } from 'vitest';

import { buildTreeIndex } from '@/domain/hierarchy';
import {
  averageProgress,
  computeEffectiveEstimatedHours,
  computeEffectiveProgress,
  remainingHours,
  type ProgressContext,
} from '@/domain/progress';
import type { CategoryCode, WorkItem } from '@/domain/types';
import { makeSampleTree, makeWorkItem } from '@/tests/factories';

const strategicCtx: ProgressContext = { categoryOf: () => 'STRATEGIC' };

function ctxWithCategories(map: Record<string, CategoryCode>): ProgressContext {
  return { categoryOf: (item: WorkItem) => map[item.id] ?? 'STRATEGIC' };
}

describe('BR-PRO-001 · chỉ leaf nhập tiến độ thủ công', () => {
  it('leaf dùng manual_progress', () => {
    const leaf = makeWorkItem({ id: 'x', manual_progress: 35 });
    const tree = buildTreeIndex([leaf]);
    const result = computeEffectiveProgress(leaf, tree, strategicCtx);
    expect(result.value).toBe(35);
    expect(result.source).toBe('MANUAL_LEAF');
  });

  it('leaf chưa nhập gì trả null, không phải 0', () => {
    const leaf = makeWorkItem({ id: 'x', manual_progress: null });
    const result = computeEffectiveProgress(leaf, buildTreeIndex([leaf]), strategicCtx);
    expect(result.value).toBeNull();
    expect(result.source).toBe('NO_DATA');
  });
});

describe('BR-PRO-002 · cha lấy trung bình các con hợp lệ', () => {
  it('trung bình đều như AVERAGE của Sheet', () => {
    const items = makeSampleTree(); // l5a = 40%, l5b = 60%
    const tree = buildTreeIndex(items);
    const l4 = items.find((i) => i.id === 'l4')!;
    const result = computeEffectiveProgress(l4, tree, strategicCtx);
    expect(result.value).toBe(50);
    expect(result.eligible_count).toBe(2);
    expect(result.source).toBe('ROLLUP_CHILDREN');
  });

  it('chế độ weighted đánh trọng số theo giờ (ADR-008, mặc định tắt)', () => {
    const items = makeSampleTree(); // l5a 40% × 16h, l5b 60% × 4h
    const tree = buildTreeIndex(items);
    const l4 = items.find((i) => i.id === 'l4')!;
    const result = computeEffectiveProgress(l4, tree, { ...strategicCtx, mode: 'weighted' });
    // (40×16 + 60×4) / 20 = 44
    expect(result.value).toBe(44);
  });
});

describe('BR-PRO-003 · loại trạng thái chưa khởi động khỏi mẫu số', () => {
  it('loại con CANCELLED / NOT_SCHEDULED / SCHEDULED', () => {
    const parent = makeWorkItem({ id: 'p', level: 4, is_leaf: false, manual_progress: null });
    const kids = [
      makeWorkItem({ id: 'k1', parent_id: 'p', effective_progress: 80, status: 'IN_PROGRESS' }),
      makeWorkItem({ id: 'k2', parent_id: 'p', effective_progress: 0, status: 'SCHEDULED' }),
      makeWorkItem({ id: 'k3', parent_id: 'p', effective_progress: 0, status: 'NOT_SCHEDULED' }),
      makeWorkItem({ id: 'k4', parent_id: 'p', effective_progress: 0, status: 'CANCELLED' }),
    ];
    const tree = buildTreeIndex([parent, ...kids]);
    const result = computeEffectiveProgress(parent, tree, strategicCtx);

    // Chỉ k1 vào mẫu số ⇒ 80%, không bị kéo xuống 20% như khi tính cả 4 con.
    expect(result.value).toBe(80);
    expect(result.eligible_count).toBe(1);
    // k4 CANCELLED bị loại khỏi activeChildren trước, nên chỉ còn k2/k3 nằm trong exclusions.
    expect(result.exclusions.map((e) => e.reason)).toEqual([
      'PRE_EXECUTION_STATUS',
      'PRE_EXECUTION_STATUS',
    ]);
  });
});

describe('BR-PRO-004 · nhóm “Công việc khác” không vào tiến độ trung bình', () => {
  it('loại con thuộc category OTHER', () => {
    const parent = makeWorkItem({ id: 'p', level: 4, is_leaf: false, manual_progress: null });
    const kids = [
      makeWorkItem({ id: 'k1', parent_id: 'p', effective_progress: 100 }),
      makeWorkItem({ id: 'k2', parent_id: 'p', effective_progress: 0 }),
    ];
    const tree = buildTreeIndex([parent, ...kids]);
    const result = computeEffectiveProgress(parent, tree, ctxWithCategories({ k2: 'OTHER' }));

    expect(result.value).toBe(100);
    expect(result.exclusions[0]).toMatchObject({ work_item_id: 'k2', reason: 'CATEGORY_EXCLUDED' });
  });
});

describe('BR-PRO-005 · cha không có con hợp lệ', () => {
  it('cha đã hoàn thành = 100%', () => {
    const parent = makeWorkItem({ id: 'p', level: 4, status: 'COMPLETED', is_leaf: false });
    const kid = makeWorkItem({ id: 'k', parent_id: 'p', status: 'SCHEDULED' });
    const tree = buildTreeIndex([parent, kid]);
    expect(computeEffectiveProgress(parent, tree, strategicCtx).value).toBe(100);
  });

  it('cha còn hoạt động nhưng không có con hợp lệ trả null', () => {
    const parent = makeWorkItem({ id: 'p', level: 4, status: 'IN_PROGRESS', manual_progress: null });
    const kid = makeWorkItem({ id: 'k', parent_id: 'p', status: 'SCHEDULED' });
    const tree = buildTreeIndex([parent, kid]);
    const result = computeEffectiveProgress(parent, tree, strategicCtx);
    expect(result.value).toBeNull();
    expect(result.excluded_count).toBe(1);
  });
});

describe('việc đã hủy', () => {
  it('không mang tiến độ vào bất kỳ tổng hợp nào', () => {
    const item = makeWorkItem({ status: 'CANCELLED', manual_progress: 100 });
    expect(computeEffectiveProgress(item, buildTreeIndex([item]), strategicCtx).value).toBeNull();
  });
});

describe('BR-LOD-001 · khối lượng giờ cuộn lên', () => {
  it('cha tổng từ con, không double-count', () => {
    const items = makeSampleTree(); // 16 + 4
    const tree = buildTreeIndex(items);
    const l4 = items.find((i) => i.id === 'l4')!;
    expect(computeEffectiveEstimatedHours(l4, tree)).toBe(20);
  });

  it('leaf dùng giờ nhập tay', () => {
    const leaf = makeWorkItem({ estimated_hours_input: 12 });
    expect(computeEffectiveEstimatedHours(leaf, buildTreeIndex([leaf]))).toBe(12);
  });
});

describe('giờ còn lại', () => {
  it('giờ × (1 − tiến độ)', () => {
    const item = makeWorkItem({ effective_estimated_hours: 100, effective_progress: 25 });
    expect(remainingHours(item)).toBe(75);
  });

  it('không âm khi tiến độ vượt 100', () => {
    const item = makeWorkItem({ effective_estimated_hours: 10, effective_progress: 120 });
    expect(remainingHours(item)).toBe(0);
  });

  it('trả null khi chưa nhập giờ — không đoán 0', () => {
    const item = makeWorkItem({ effective_estimated_hours: null });
    expect(remainingHours(item)).toBeNull();
  });
});

describe('averageProgress cho tập tùy ý', () => {
  it('áp cùng bộ loại trừ như roll-up', () => {
    const items = [
      makeWorkItem({ id: 'a', effective_progress: 100 }),
      makeWorkItem({ id: 'b', effective_progress: 0, status: 'SCHEDULED' }),
    ];
    const result = averageProgress(items, strategicCtx);
    expect(result.value).toBe(100);
    expect(result.excluded_count).toBe(1);
  });

  it('tập rỗng trả null', () => {
    expect(averageProgress([], strategicCtx).value).toBeNull();
  });
});
