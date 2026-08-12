import { describe, expect, it } from 'vitest';

import {
  ancestorsOf,
  breadcrumbOf,
  buildTreeIndex,
  computeIsLeaf,
  computePath,
  descendantsOf,
  postOrder,
  requiredParentLevel,
  validateParentRelation,
} from '@/domain/hierarchy';
import { makeSampleTree, makeWorkItem } from '@/tests/factories';

describe('BR-HIE-001 · cấp cha bắt buộc', () => {
  it('L3 không có cha', () => {
    expect(requiredParentLevel(3)).toBeNull();
    expect(validateParentRelation({ level: 3, parent: null })).toBeNull();
  });

  it('L3 gắn cha bị chặn', () => {
    const parent = makeWorkItem({ level: 3 });
    expect(validateParentRelation({ level: 3, parent })?.code).toBe('L3_MUST_NOT_HAVE_PARENT');
  });

  it('L5 thiếu cha bị chặn', () => {
    expect(validateParentRelation({ level: 5, parent: null })?.code).toBe('MISSING_PARENT');
  });

  it('L5 gắn vào L3 bị chặn — phải là L4', () => {
    const parent = makeWorkItem({ level: 3 });
    const violation = validateParentRelation({ level: 5, parent });
    expect(violation?.code).toBe('INVALID_PARENT_LEVEL');
    expect(violation?.message).toContain('L4');
  });

  it('L6 gắn vào L5 hợp lệ', () => {
    const parent = makeWorkItem({ level: 5 });
    expect(validateParentRelation({ level: 6, parent })).toBeNull();
  });
});

describe('BR-HIE-002 · chống self-parent và cycle', () => {
  it('không cho chọn chính mình làm cha', () => {
    const item = makeWorkItem({ id: 'x', level: 4 });
    expect(validateParentRelation({ itemId: 'x', level: 4, parent: item })?.code).toBe('SELF_PARENT');
  });

  it('phát hiện vòng lặp khi reparent lên hậu duệ của chính nó', () => {
    // Ràng buộc cấp đã chặn phần lớn vòng lặp; đây là lớp phòng vệ cho dữ liệu import lỗi.
    // Chuỗi bị hỏng: b(L4) → c(L5) → d(L3, nhưng parent_id trỏ vào c).
    // Reparent b vào d qua được kiểm tra cấp (L4 cần cha L3) nên phải bị bắt bởi phát hiện cycle.
    const a = makeWorkItem({ id: 'a', level: 3, parent_id: null });
    const b = makeWorkItem({ id: 'b', level: 4, parent_id: 'a' });
    const c = makeWorkItem({ id: 'c', level: 5, parent_id: 'b' });
    const d = makeWorkItem({ id: 'd', level: 3, parent_id: 'c' });
    const byId = new Map([a, b, c, d].map((i) => [i.id, i]));

    const violation = validateParentRelation({
      itemId: 'b',
      level: 4,
      parent: d,
      resolveParent: (id) => byId.get(id) ?? null,
    });
    expect(violation?.code).toBe('CYCLE_DETECTED');
  });

  it('reparent hợp lệ sang một nhánh khác không bị báo cycle', () => {
    const a1 = makeWorkItem({ id: 'a1', level: 3, parent_id: null });
    const a2 = makeWorkItem({ id: 'a2', level: 3, parent_id: null });
    const b = makeWorkItem({ id: 'b', level: 4, parent_id: 'a1' });
    const byId = new Map([a1, a2, b].map((i) => [i.id, i]));

    expect(
      validateParentRelation({
        itemId: 'b',
        level: 4,
        parent: a2,
        resolveParent: (id) => byId.get(id) ?? null,
      }),
    ).toBeNull();
  });
});

describe('cha bị hủy/lưu trữ', () => {
  it('không cho gắn vào cha đã lưu trữ', () => {
    const parent = makeWorkItem({ level: 4, is_archived: true });
    expect(validateParentRelation({ level: 5, parent })?.code).toBe('PARENT_ARCHIVED');
  });

  it('không cho gắn vào cha đã hủy', () => {
    const parent = makeWorkItem({ level: 4, status: 'CANCELLED' });
    expect(validateParentRelation({ level: 5, parent })?.code).toBe('PARENT_CANCELLED');
  });
});

describe('BR-HIE-004 · is_leaf', () => {
  it('node có con đang hoạt động không phải leaf', () => {
    const tree = buildTreeIndex(makeSampleTree());
    expect(computeIsLeaf(tree, 'l4')).toBe(false);
    expect(computeIsLeaf(tree, 'l5a')).toBe(true);
  });

  it('con đã hủy không giữ cha khỏi trạng thái leaf', () => {
    const items = makeSampleTree().map((i) =>
      i.id === 'l5a' || i.id === 'l5b' ? { ...i, status: 'CANCELLED' as const } : i,
    );
    const tree = buildTreeIndex(items);
    expect(computeIsLeaf(tree, 'l4')).toBe(true);
  });

  it('con đã lưu trữ cũng không giữ cha khỏi trạng thái leaf', () => {
    const items = makeSampleTree().map((i) =>
      i.id === 'l5a' || i.id === 'l5b' ? { ...i, is_archived: true } : i,
    );
    expect(computeIsLeaf(buildTreeIndex(items), 'l4')).toBe(true);
  });
});

describe('điều hướng cây', () => {
  const tree = buildTreeIndex(makeSampleTree());

  it('tổ tiên xếp từ gần tới gốc', () => {
    expect(ancestorsOf(tree, 'l5a').map((i) => i.id)).toEqual(['l4', 'l3']);
  });

  it('breadcrumb xếp từ L3 tới node hiện tại', () => {
    expect(breadcrumbOf(tree, 'l5a').map((i) => i.id)).toEqual(['l3', 'l4', 'l5a']);
  });

  it('hậu duệ gồm toàn bộ nhánh dưới', () => {
    expect(descendantsOf(tree, 'l3').map((i) => i.id).sort()).toEqual(['l4', 'l5a', 'l5b']);
  });

  it('post-order đưa con lên trước cha', () => {
    const order = postOrder(tree).map((i) => i.id);
    expect(order.indexOf('l5a')).toBeLessThan(order.indexOf('l4'));
    expect(order.indexOf('l4')).toBeLessThan(order.indexOf('l3'));
  });
});

describe('computePath', () => {
  it('L3 bắt đầu bằng dấu /', () => {
    expect(computePath('HHL3CT03', null)).toBe('/HHL3CT03');
  });

  it('node con nối tiếp path của cha', () => {
    const parent = makeWorkItem({ path: '/HHL3CT03' });
    expect(computePath('HHL4DL01', parent)).toBe('/HHL3CT03/HHL4DL01');
  });
});
