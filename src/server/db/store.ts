import 'server-only';

import { env } from '@/config/env';

import type { TableName } from './schema';

/**
 * Cổng dữ liệu duy nhất của ứng dụng (ADR-003).
 *
 * Domain service và repository chỉ nói chuyện với interface này; chúng **không biết** dữ liệu
 * nằm ở Appwrite TablesDB hay file JSON local. Lọc/sắp xếp/phân trang đều được đẩy xuống driver
 * và thực hiện phía server — không bao giờ tải toàn bộ bảng về rồi lọc ở trình duyệt
 * (guideline mục 0.12).
 */

export interface Row {
  id: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export type FilterOp =
  | 'eq'
  | 'ne'
  | 'in'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'search'
  | 'isNull'
  | 'notNull';

export interface Filter {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface Sort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface QueryOptions {
  filters?: Filter[];
  sort?: Sort[];
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface DataStore {
  /** Đọc có phân trang/lọc/sắp xếp — dùng cho mọi màn hình danh sách. */
  list<T extends Row>(table: TableName, options?: QueryOptions): Promise<Page<T>>;
  /** Đọc trọn bảng — CHỈ dùng cho bảng danh mục nhỏ và cây công việc theo `root_id`. */
  all<T extends Row>(table: TableName, options?: QueryOptions): Promise<T[]>;
  get<T extends Row>(table: TableName, id: string): Promise<T | null>;
  insert<T extends Row>(table: TableName, row: Omit<T, 'created_at' | 'updated_at'>): Promise<T>;
  update<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<T>;
  delete(table: TableName, id: string): Promise<void>;
  /**
   * Ghi đè theo `id`, tạo mới nếu chưa có. Dùng cho seed/import — chạy lại nhiều lần cho cùng
   * kết quả mà không cần đọc trước để kiểm tra tồn tại.
   */
  upsert<T extends Row>(table: TableName, row: Omit<T, 'created_at' | 'updated_at'>): Promise<T>;
  updateMany(table: TableName, updates: { id: string; patch: Record<string, unknown> }[]): Promise<void>;
  /**
   * Ghi nhiều bảng như một đơn vị. Driver Appwrite dùng transaction của TablesDB;
   * driver local ghi file một lần ở cuối. Lỗi ⇒ không có thay đổi nào được lưu.
   */
  transaction<R>(fn: (tx: DataStore) => Promise<R>): Promise<R>;
  /** Dùng cho `/api/ready`. */
  ping(): Promise<{ ok: boolean; driver: string; detail?: string }>;
}

let instance: DataStore | null = null;

export async function getStore(): Promise<DataStore> {
  if (instance) return instance;

  if (env().DATA_DRIVER === 'appwrite') {
    const { createAppwriteStore } = await import('./appwrite-driver');
    instance = createAppwriteStore();
  } else {
    const { createLocalStore } = await import('./local-driver');
    instance = createLocalStore();
  }

  return instance;
}

/** Chỉ dùng trong test/script để nạp lại driver sau khi đổi cấu hình. */
export function resetStore(): void {
  instance = null;
}

// ---------------------------------------------------------------------------
// Tiện ích dùng chung cho các driver
// ---------------------------------------------------------------------------

export function matchesFilter(row: Record<string, unknown>, filter: Filter): boolean {
  const value = row[filter.field];

  switch (filter.op) {
    case 'eq':
      return Array.isArray(value) ? value.includes(filter.value) : value === filter.value;
    case 'ne':
      return value !== filter.value;
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value as never);
    case 'lt':
      return value !== null && value !== undefined && (value as never) < (filter.value as never);
    case 'lte':
      return value !== null && value !== undefined && (value as never) <= (filter.value as never);
    case 'gt':
      return value !== null && value !== undefined && (value as never) > (filter.value as never);
    case 'gte':
      return value !== null && value !== undefined && (value as never) >= (filter.value as never);
    case 'contains':
      if (Array.isArray(value)) return value.includes(filter.value);
      return String(value ?? '')
        .toLocaleLowerCase('vi')
        .includes(String(filter.value ?? '').toLocaleLowerCase('vi'));
    case 'search':
      return normalizeForSearch(String(value ?? '')).includes(
        normalizeForSearch(String(filter.value ?? '')),
      );
    case 'isNull':
      return value === null || value === undefined || value === '';
    case 'notNull':
      return value !== null && value !== undefined && value !== '';
  }
}

/** Bỏ dấu tiếng Việt để tìm kiếm “de quy” khớp “đệ quy”. */
export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function compareRows(a: Record<string, unknown>, b: Record<string, unknown>, sort: Sort[]): number {
  for (const { field, dir } of sort) {
    const av = a[field];
    const bv = b[field];
    const nullA = av === null || av === undefined;
    const nullB = bv === null || bv === undefined;
    // Giá trị trống luôn xuống cuối, bất kể chiều sắp xếp.
    if (nullA && nullB) continue;
    if (nullA) return 1;
    if (nullB) return -1;

    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv);
    else cmp = String(av).localeCompare(String(bv), 'vi');

    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}
