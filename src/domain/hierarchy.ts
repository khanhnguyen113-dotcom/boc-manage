/**
 * Quan hệ cây từ L3 trở xuống: validate cấp cha, chống cycle, sinh `path`/`root_id`/`depth`,
 * xác định điểm cuối (leaf).
 *
 * Guideline 3.1 và BR-HIE-001…006.
 */

import type { WorkItem, WorkLevel } from './types';

export const MIN_LEVEL: WorkLevel = 3;

export function isWorkLevel(value: unknown): value is WorkLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_LEVEL;
}

/** Cấp cha hợp lệ luôn là lớp liền trước; L3 là gốc và không có cha. */
export function requiredParentLevel(level: WorkLevel): WorkLevel | null {
  return level === MIN_LEVEL ? null : ((level - 1) as WorkLevel);
}

export type HierarchyErrorCode =
  | 'L3_MUST_NOT_HAVE_PARENT'
  | 'MISSING_PARENT'
  | 'PARENT_NOT_FOUND'
  | 'INVALID_PARENT_LEVEL'
  | 'SELF_PARENT'
  | 'CYCLE_DETECTED'
  | 'PARENT_ARCHIVED'
  | 'PARENT_CANCELLED';

export interface HierarchyViolation {
  code: HierarchyErrorCode;
  message: string;
}

/**
 * BR-HIE-001/002: kiểm tra quan hệ cha–con trước khi ghi.
 * `resolveParent` cho phép truy ngược lên tổ tiên để phát hiện cycle khi reparent.
 */
export function validateParentRelation(params: {
  itemId?: string | null;
  level: WorkLevel;
  parent: WorkItem | null;
  resolveParent?: (id: string) => WorkItem | null;
}): HierarchyViolation | null {
  const { itemId, level, parent, resolveParent } = params;
  const expected = requiredParentLevel(level);

  if (expected === null) {
    return parent
      ? { code: 'L3_MUST_NOT_HAVE_PARENT', message: 'Công việc L3 không được có công việc cha.' }
      : null;
  }

  if (!parent) {
    return { code: 'MISSING_PARENT', message: `Công việc L${level} phải chọn công việc cha L${expected}.` };
  }

  if (itemId && parent.id === itemId) {
    return { code: 'SELF_PARENT', message: 'Không thể chọn chính công việc này làm cha.' };
  }

  if (parent.level !== expected) {
    return {
      code: 'INVALID_PARENT_LEVEL',
      message: `Công việc L${level} phải có cha là L${expected}, đang chọn L${parent.level}.`,
    };
  }

  if (parent.is_archived) {
    return { code: 'PARENT_ARCHIVED', message: 'Không thể gắn vào công việc cha đã lưu trữ.' };
  }

  if (parent.status === 'CANCELLED') {
    return { code: 'PARENT_CANCELLED', message: 'Không thể gắn vào công việc cha đã hủy.' };
  }

  if (itemId && resolveParent) {
    // Đi ngược lên gốc: nếu gặp lại chính node đang sửa thì reparent tạo vòng lặp.
    const seen = new Set<string>([itemId]);
    let cursor: WorkItem | null = parent;
    while (cursor) {
      if (seen.has(cursor.id)) {
        return { code: 'CYCLE_DETECTED', message: 'Thao tác này tạo vòng lặp trong cây công việc.' };
      }
      seen.add(cursor.id);
      cursor = cursor.parent_id ? resolveParent(cursor.parent_id) : null;
    }
  }

  return null;
}

/** `path` của node = path cha + `/` + code. L3: `/CODE`. Server sinh, client không gửi. */
export function computePath(code: string, parent: WorkItem | null): string {
  return parent ? `${parent.path}/${code}` : `/${code}`;
}

export function computeRootId(itemId: string, parent: WorkItem | null): string {
  return parent ? parent.root_id : itemId;
}

export function computeDepth(level: WorkLevel): number {
  return Math.max(0, level - MIN_LEVEL);
}

export interface RebasedWorkNode {
  id: string;
  level: WorkLevel;
  depth: number;
  path: string;
  root_id: string;
  year: number;
  management_level_id: string;
  category_id: string;
}

/**
 * Lập kế hoạch đổi cấp cho toàn bộ nhánh sau khi chuyển node gốc sang cha mới.
 * Mỗi cạnh trong nhánh luôn tăng đúng một lớp, kể cả dữ liệu cũ từng lệch cấp.
 */
export function rebaseSubtree(
  tree: TreeIndex,
  root: WorkItem,
  newParent: WorkItem | null,
): RebasedWorkNode[] {
  const rootLevel = newParent ? newParent.level + 1 : MIN_LEVEL;
  const rootPath = computePath(root.code, newParent);
  const rootId = newParent?.root_id ?? root.id;
  const year = newParent?.year ?? root.year;
  const managementLevelId = newParent?.management_level_id ?? root.management_level_id;
  const categoryId = newParent?.category_id ?? root.category_id;
  const result: RebasedWorkNode[] = [];

  const walk = (node: WorkItem, level: WorkLevel, path: string) => {
    result.push({
      id: node.id,
      level,
      depth: computeDepth(level),
      path,
      root_id: rootId,
      year,
      management_level_id: managementLevelId,
      category_id: categoryId,
    });
    for (const child of tree.childrenOf.get(node.id) ?? []) {
      walk(child, level + 1, `${path}/${child.code}`);
    }
  };

  walk(root, rootLevel, rootPath);
  return result;
}

// ---------------------------------------------------------------------------
// Chỉ mục cây
// ---------------------------------------------------------------------------

export interface TreeIndex {
  byId: Map<string, WorkItem>;
  /** parent_id → danh sách con (mọi trạng thái). */
  childrenOf: Map<string, WorkItem[]>;
  roots: WorkItem[];
}

export function buildTreeIndex(items: readonly WorkItem[]): TreeIndex {
  const byId = new Map<string, WorkItem>();
  const childrenOf = new Map<string, WorkItem[]>();
  const roots: WorkItem[] = [];

  for (const item of items) byId.set(item.id, item);

  for (const item of items) {
    if (item.parent_id && byId.has(item.parent_id)) {
      const bucket = childrenOf.get(item.parent_id);
      if (bucket) bucket.push(item);
      else childrenOf.set(item.parent_id, [item]);
    } else {
      roots.push(item);
    }
  }

  const order = (a: WorkItem, b: WorkItem) => a.code.localeCompare(b.code, 'vi');
  for (const bucket of childrenOf.values()) bucket.sort(order);
  roots.sort(order);

  return { byId, childrenOf, roots };
}

export function childrenOf(tree: TreeIndex, id: string): WorkItem[] {
  return tree.childrenOf.get(id) ?? [];
}

/**
 * BR-HIE-004: con “còn sống” — không hủy, không lưu trữ.
 * Đây là tập quyết định `is_leaf`, khác với tập tính tiến độ (xem `progress.ts`).
 */
export function activeChildren(tree: TreeIndex, id: string): WorkItem[] {
  return childrenOf(tree, id).filter((c) => !c.is_archived && c.status !== 'CANCELLED');
}

export function computeIsLeaf(tree: TreeIndex, id: string): boolean {
  return activeChildren(tree, id).length === 0;
}

/** Tổ tiên từ gần nhất tới gốc. */
export function ancestorsOf(tree: TreeIndex, id: string): WorkItem[] {
  const out: WorkItem[] = [];
  let cursor = tree.byId.get(id);
  const guard = new Set<string>([id]);
  while (cursor?.parent_id) {
    const parent = tree.byId.get(cursor.parent_id);
    if (!parent || guard.has(parent.id)) break;
    guard.add(parent.id);
    out.push(parent);
    cursor = parent;
  }
  return out;
}

/** Toàn bộ hậu duệ (DFS, không kể chính node). */
export function descendantsOf(tree: TreeIndex, id: string): WorkItem[] {
  const out: WorkItem[] = [];
  const stack = [...childrenOf(tree, id)];
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    stack.push(...childrenOf(tree, node.id));
  }
  return out;
}

/** Đường dẫn hiển thị L3 → node hiện tại (breadcrumb). */
export function breadcrumbOf(tree: TreeIndex, id: string): WorkItem[] {
  const node = tree.byId.get(id);
  if (!node) return [];
  return [...ancestorsOf(tree, id).reverse(), node];
}

/**
 * Thứ tự duyệt từ lá lên gốc — bảo đảm khi tính lại thì con luôn xong trước cha.
 * Dùng trong `recalc.ts`.
 */
export function postOrder(tree: TreeIndex, rootIds?: readonly string[]): WorkItem[] {
  const roots = rootIds
    ? rootIds.map((id) => tree.byId.get(id)).filter((n): n is WorkItem => Boolean(n))
    : tree.roots;
  const out: WorkItem[] = [];
  const visit = (node: WorkItem) => {
    for (const child of childrenOf(tree, node.id)) visit(child);
    out.push(node);
  };
  for (const root of roots) visit(root);
  return out;
}
