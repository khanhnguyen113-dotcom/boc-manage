import { describe, expect, it } from 'vitest';

import { recalculateAffected, recalculateTree } from '@/domain/recalc';
import type { WorkItem } from '@/domain/types';
import { makeSampleTree, makeWorkItem } from '@/tests/factories';

const options = { categoryCodeOf: () => 'STRATEGIC' as const };

function byId(items: WorkItem[], id: string): WorkItem {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`Không tìm thấy ${id}`);
  return found;
}

describe('BR-PRO-006 · cuộn từ lá lên gốc', () => {
  it('L5 → L4 → L3 cùng một lượt', () => {
    const { items } = recalculateTree(makeSampleTree(), options);
    expect(byId(items, 'l4').effective_progress).toBe(50); // (40 + 60) / 2
    expect(byId(items, 'l3').effective_progress).toBe(50);
    expect(byId(items, 'l4').effective_estimated_hours).toBe(20);
    expect(byId(items, 'l3').effective_estimated_hours).toBe(20);
  });

  it('sửa một lá thì cha đổi theo', () => {
    const base = makeSampleTree().map((i) =>
      i.id === 'l5a' ? { ...i, manual_progress: 100 } : i,
    );
    const { items } = recalculateTree(base, options);
    expect(byId(items, 'l4').effective_progress).toBe(80); // (100 + 60) / 2
  });

  it('đánh dấu đúng những node thực sự thay đổi', () => {
    const base = makeSampleTree().map((i) =>
      i.id === 'l5a' ? { ...i, manual_progress: 100, effective_progress: 100 } : i,
    );
    const { changedIds } = recalculateTree(base, options);
    expect(changedIds.has('l4')).toBe(true);
    expect(changedIds.has('l3')).toBe(true);
    expect(changedIds.has('l5b')).toBe(false);
  });
});

describe('idempotent', () => {
  it('chạy hai lần cho kết quả giống nhau và lần hai không có thay đổi', () => {
    const first = recalculateTree(makeSampleTree(), options);
    const second = recalculateTree(first.items, options);
    expect(second.changedIds.size).toBe(0);
    expect(second.items.map((i) => i.effective_progress)).toEqual(
      first.items.map((i) => i.effective_progress),
    );
  });
});

describe('is_leaf và ngày hiển thị được cập nhật cùng lúc', () => {
  it('node có con: không phải leaf, ngày mở rộng theo con', () => {
    const base = makeSampleTree().map((i) =>
      i.id === 'l5a'
        ? { ...i, planned_start: '2026-07-01', planned_end: '2026-12-31', display_start: null, display_end: null }
        : i,
    );
    const { items } = recalculateTree(base, options);
    const l4 = byId(items, 'l4');
    expect(l4.is_leaf).toBe(false);
    expect(l4.display_start).toBe('2026-07-01');
    expect(l4.display_end).toBe('2026-12-31');
  });

  it('hủy toàn bộ con thì cha trở lại thành leaf', () => {
    const base = makeSampleTree().map((i) =>
      i.id.startsWith('l5') ? { ...i, status: 'CANCELLED' as const } : i,
    );
    const { items } = recalculateTree(base, options);
    expect(byId(items, 'l4').is_leaf).toBe(true);
  });
});

describe('chất lượng dữ liệu được tính lại cùng lượt', () => {
  it('cảnh báo con vượt khung được ghi vào mã lỗi của cha', () => {
    const base = makeSampleTree().map((i) => {
      if (i.id === 'l4') return { ...i, planned_start: '2026-08-10', planned_end: '2026-08-20' };
      if (i.id === 'l5a') return { ...i, planned_start: '2026-08-01', planned_end: '2026-09-30' };
      return i;
    });
    const { items } = recalculateTree(base, options);
    expect(byId(items, 'l4').data_quality_codes).toContain('CHILD_OUTSIDE_PARENT_BASELINE');
  });
});

describe('recalculateAffected', () => {
  it('chỉ tính lại các cây có liên quan', () => {
    const treeA = makeSampleTree();
    const other = makeWorkItem({ id: 'other', code: 'HHL3RD01', level: 3, root_id: 'other' });
    const all = [...treeA, other];

    const { items } = recalculateAffected(all, ['l5a'], options);
    expect(items.map((i) => i.id).sort()).toEqual(['l3', 'l4', 'l5a', 'l5b']);
  });

  it('id không tồn tại thì không tính gì', () => {
    const { items, changedIds } = recalculateAffected(makeSampleTree(), ['khong-co'], options);
    expect(items).toEqual([]);
    expect(changedIds.size).toBe(0);
  });

  it('không mutate mảng đầu vào', () => {
    const input = makeSampleTree();
    const before = input.map((i) => i.effective_progress);
    recalculateTree(input, options);
    expect(input.map((i) => i.effective_progress)).toEqual(before);
  });
});
