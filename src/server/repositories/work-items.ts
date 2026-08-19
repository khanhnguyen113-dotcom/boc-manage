import 'server-only';

import { cache } from 'react';

import type { EffectiveScope } from '@/domain/permissions';
import type {
  DataQualityStatus,
  Priority,
  ScheduleType,
  WorkAssignment,
  WorkItem,
  WorkLevel,
  WorkStatus,
} from '@/domain/types';

import { DEFAULT_PAGE_SIZE } from '@/config/pagination';

import { getStore, type Filter, type Row, type Sort } from '../db/store';

/**
 * Truy vấn `work_items`. Lọc/sắp xếp/phân trang đẩy xuống store (guideline 0.12).
 *
 * Mọi hàm đọc đều nhận `EffectiveScope` và tự lọc theo phạm vi — không có đường nào đọc được
 * dữ liệu ngoài scope kể cả khi gọi trực tiếp từ route handler (ADR-004).
 */

export interface WorkItemQuery {
  search?: string;
  code?: string;
  level?: WorkLevel[];
  status?: WorkStatus[];
  priority?: Priority[];
  scheduleType?: ScheduleType[];
  year?: number;
  unitId?: string;
  leadUserId?: string;
  assigneeUserId?: string;
  managementLevelId?: string;
  categoryId?: string;
  parentId?: string;
  rootId?: string;
  dataQuality?: DataQualityStatus[];
  includeArchived?: boolean;
  onlyLeaf?: boolean;
  hasResult?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  sort?: Sort[];
  page?: number;
  pageSize?: number;
}

export { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/config/pagination';

function baseFilters(query: WorkItemQuery): Filter[] {
  const filters: Filter[] = [];

  if (!query.includeArchived) filters.push({ field: 'is_archived', op: 'eq', value: false });
  if (query.code) filters.push({ field: 'code', op: 'eq', value: query.code });
  if (query.year) filters.push({ field: 'year', op: 'eq', value: query.year });
  if (query.unitId) filters.push({ field: 'owning_unit_id', op: 'eq', value: query.unitId });
  if (query.leadUserId) filters.push({ field: 'lead_user_id', op: 'eq', value: query.leadUserId });
  if (query.assigneeUserId) {
    filters.push({ field: 'primary_assignee_id', op: 'eq', value: query.assigneeUserId });
  }
  if (query.managementLevelId) {
    filters.push({ field: 'management_level_id', op: 'eq', value: query.managementLevelId });
  }
  if (query.categoryId) filters.push({ field: 'category_id', op: 'eq', value: query.categoryId });
  if (query.parentId) filters.push({ field: 'parent_id', op: 'eq', value: query.parentId });
  if (query.rootId) filters.push({ field: 'root_id', op: 'eq', value: query.rootId });
  if (query.onlyLeaf) filters.push({ field: 'is_leaf', op: 'eq', value: true });
  if (query.hasResult) filters.push({ field: 'result_link', op: 'notNull' });
  if (query.dueBefore) filters.push({ field: 'display_end', op: 'lte', value: query.dueBefore });
  if (query.dueAfter) filters.push({ field: 'display_end', op: 'gte', value: query.dueAfter });

  return filters;
}

/**
 * Bộ lọc “nhiều giá trị” và tìm kiếm không dấu chạy sau khi store trả kết quả cơ sở.
 * Với Appwrite, các cột này đều có index nên bước lọc cơ sở đã thu hẹp mạnh tập dữ liệu.
 */
function applyMultiValue(rows: WorkItem[], query: WorkItemQuery): WorkItem[] {
  let result = rows;
  if (query.level?.length) result = result.filter((r) => query.level!.includes(r.level));
  if (query.status?.length) result = result.filter((r) => query.status!.includes(r.status));
  if (query.priority?.length) {
    result = result.filter((r) => r.priority && query.priority!.includes(r.priority));
  }
  if (query.scheduleType?.length) {
    result = result.filter((r) => query.scheduleType!.includes(r.schedule_type));
  }
  if (query.dataQuality?.length) {
    result = result.filter((r) => query.dataQuality!.includes(r.data_quality_status));
  }
  return result;
}

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function applySearch(rows: WorkItem[], search: string | undefined): WorkItem[] {
  if (!search?.trim()) return rows;
  const needle = normalize(search);
  return rows.filter(
    (r) =>
      normalize(r.code).includes(needle) ||
      normalize(r.title).includes(needle) ||
      normalize(r.expected_output ?? '').includes(needle),
  );
}

/** Lọc theo phạm vi dữ liệu — guideline 4.5. Deny by default. */
export function filterByScope(
  rows: WorkItem[],
  scope: EffectiveScope,
  collaboratorItemIds: ReadonlySet<string>,
): WorkItem[] {
  if (scope.all) return rows;
  return rows.filter(
    (item) =>
      scope.unit_ids.has(item.owning_unit_id) ||
      item.created_by === scope.user_id ||
      item.lead_user_id === scope.user_id ||
      item.primary_assignee_id === scope.user_id ||
      collaboratorItemIds.has(item.id),
  );
}

/** Id các công việc mà user là người phối hợp. */
export const collaboratorItemIdsFor = cache(async (userId: string): Promise<Set<string>> => {
  const store = await getStore();
  const rows = await store.all<Row & WorkAssignment>('work_assignments', {
    filters: [
      { field: 'user_id', op: 'eq', value: userId },
      { field: 'is_active', op: 'eq', value: true },
    ],
  });
  return new Set(rows.map((r) => r.work_item_id));
});

export interface WorkItemPage {
  rows: WorkItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * `derivedFilter` chạy **trước** khi sắp xếp và phân trang.
 *
 * Các bộ lọc như “quá hạn”, “sắp đến hạn”, “thiếu người thực hiện” phụ thuộc ngày nghiệp vụ và
 * lịch làm việc — kiến thức của tầng domain, không thuộc repository. Nếu lọc sau phân trang thì
 * tổng số và drill-down từ KPI sẽ sai, nên predicate phải được truyền vào đây.
 */
export async function searchWorkItems(
  query: WorkItemQuery,
  scope: EffectiveScope,
  derivedFilter?: (item: WorkItem) => boolean,
): Promise<WorkItemPage> {
  const store = await getStore();
  const collaborators = await collaboratorItemIdsFor(scope.user_id);

  const base = await store.all<Row & WorkItem>('work_items', { filters: baseFilters(query) });

  let rows = filterByScope(base, scope, collaborators);
  rows = applyMultiValue(rows, query);
  rows = applySearch(rows, query.search);
  if (derivedFilter) rows = rows.filter(derivedFilter);

  const sort = query.sort ?? [{ field: 'code', dir: 'asc' as const }];
  rows = [...rows].sort((a, b) => compare(a, b, sort));

  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, query.page ?? 1);
  const total = rows.length;
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function compare(a: WorkItem, b: WorkItem, sort: Sort[]): number {
  for (const { field, dir } of sort) {
    const av = (a as unknown as Record<string, unknown>)[field];
    const bv = (b as unknown as Record<string, unknown>)[field];
    const nullA = av === null || av === undefined;
    const nullB = bv === null || bv === undefined;
    if (nullA && nullB) continue;
    if (nullA) return 1;
    if (nullB) return -1;
    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), 'vi');
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}

/**
 * Toàn bộ công việc trong phạm vi — dùng cho dashboard/báo cáo/cây.
 * Tập dữ liệu BOC ở mức trăm–nghìn bản ghi nên đọc trọn là chấp nhận được; khi vượt ngưỡng,
 * thay bằng `report_snapshots` theo guideline 7.17 mà không đổi chữ ký hàm.
 */
export async function listWorkItemsInScope(
  scope: EffectiveScope,
  options: { year?: number; includeArchived?: boolean } = {},
): Promise<WorkItem[]> {
  const store = await getStore();
  const collaborators = await collaboratorItemIdsFor(scope.user_id);
  const filters: Filter[] = [];
  if (!options.includeArchived) filters.push({ field: 'is_archived', op: 'eq', value: false });
  if (options.year) filters.push({ field: 'year', op: 'eq', value: options.year });

  const rows = await store.all<Row & WorkItem>('work_items', { filters });
  return filterByScope(rows, scope, collaborators);
}

/** Đọc **toàn bộ** cây chứa các node liên quan — bắt buộc để roll-up không thiếu con. */
export async function listTreeFor(rootIds: readonly string[]): Promise<WorkItem[]> {
  if (rootIds.length === 0) return [];
  const store = await getStore();
  const all = await store.all<Row & WorkItem>('work_items');
  const set = new Set(rootIds);
  return all.filter((item) => set.has(item.root_id));
}

export async function listAllWorkItems(): Promise<WorkItem[]> {
  const store = await getStore();
  return store.all<Row & WorkItem>('work_items');
}

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const store = await getStore();
  const item = await store.get<Row & WorkItem>('work_items', id);
  return item?.is_deleted ? null : item;
}

export async function getWorkItemByCode(code: string): Promise<WorkItem | null> {
  const store = await getStore();
  const rows = await store.all<Row & WorkItem>('work_items', {
    filters: [{ field: 'code', op: 'eq', value: code }],
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function listAssignments(workItemId: string): Promise<WorkAssignment[]> {
  const store = await getStore();
  return store.all<Row & WorkAssignment>('work_assignments', {
    filters: [
      { field: 'work_item_id', op: 'eq', value: workItemId },
      { field: 'is_active', op: 'eq', value: true },
    ],
  });
}

export async function listAssignmentsFor(workItemIds: readonly string[]): Promise<WorkAssignment[]> {
  if (workItemIds.length === 0) return [];
  const store = await getStore();
  const all = await store.all<Row & WorkAssignment>('work_assignments', {
    filters: [{ field: 'is_active', op: 'eq', value: true }],
  });
  const set = new Set(workItemIds);
  return all.filter((a) => set.has(a.work_item_id));
}
