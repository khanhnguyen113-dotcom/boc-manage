import 'server-only';

import { Client, ID, Query, TablesDB } from 'node-appwrite';

import { env } from '@/config/env';

import { installAppwriteDnsOverride } from '../appwrite/dns-override';
import {
  mapFilterValue,
  mapRowFromStorage,
  mapRowToStorage,
  toStorageField,
} from './appwrite-mapping';
import type { TableName } from './schema';
import type { DataStore, Filter, Page, QueryOptions, Row, Sort } from './store';

/**
 * Lệch múi giờ dùng khi neo ngày nghiệp vụ vào mốc lưu trữ. Giữ cố định `+07:00` cho
 * `Asia/Ho_Chi_Minh` — Việt Nam không có quy ước giờ mùa hè nên không cần tra bảng.
 */
const BUSINESS_DATE_OFFSET = '+07:00';

/**
 * Driver production: Appwrite TablesDB (guideline mục 0.13 — dùng nhất quán API tables/rows,
 * không trộn với API “legacy collections/documents”).
 *
 * API key chỉ tồn tại trong tiến trình server. Không có đường nào để client gọi trực tiếp
 * bảng nghiệp vụ (ADR-010).
 */

function createClient(): Client {
  const e = env();
  // Chỉ có tác dụng khi APPWRITE_RESOLVE_HOST/IP được đặt (ADR-016). Mặc định không làm gì.
  installAppwriteDnsOverride();
  return new Client()
    .setEndpoint(e.APPWRITE_ENDPOINT!)
    .setProject(e.APPWRITE_PROJECT_ID!)
    .setKey(e.APPWRITE_SERVER_API_KEY!);
}

/** Appwrite trả về `$id`/`$createdAt`/`$updatedAt`; domain dùng `id`/`created_at`/`updated_at`. */
function toRow<T extends Row>(table: TableName, doc: Record<string, unknown>): T {
  const { $id, $createdAt, $updatedAt, $permissions, $collectionId, $databaseId, $tableId, ...rest } =
    doc as Record<string, unknown> & { $id: string; $createdAt: string; $updatedAt: string };
  void $permissions;
  void $collectionId;
  void $databaseId;
  void $tableId;

  const mapped = mapRowFromStorage(table, rest, env().APP_TIMEZONE);
  return { ...mapped, id: $id, created_at: $createdAt, updated_at: $updatedAt } as T;
}

function toPayload(table: TableName, row: Record<string, unknown>): Record<string, unknown> {
  const { id, created_at, updated_at, ...rest } = row;
  void id;
  void created_at;
  void updated_at;
  return mapRowToStorage(table, rest, BUSINESS_DATE_OFFSET);
}

function buildQueries(table: TableName, options?: QueryOptions): string[] {
  const queries: string[] = [];

  for (const filter of options?.filters ?? []) {
    queries.push(
      toQuery({
        ...filter,
        field: toStorageField(filter.field),
        value: mapFilterValue(table, filter.field, filter.value, BUSINESS_DATE_OFFSET),
      }),
    );
  }
  for (const sort of options?.sort ?? []) {
    queries.push(toSortQuery({ ...sort, field: toStorageField(sort.field) }));
  }
  if (options?.limit !== undefined) queries.push(Query.limit(options.limit));
  if (options?.offset) queries.push(Query.offset(options.offset));

  return queries;
}

function toQuery(filter: Filter): string {
  const { field, op, value } = filter;
  switch (op) {
    case 'eq':
      return Query.equal(field, value as never);
    case 'ne':
      return Query.notEqual(field, value as never);
    case 'in':
      return Query.equal(field, value as never);
    case 'lt':
      return Query.lessThan(field, value as never);
    case 'lte':
      return Query.lessThanEqual(field, value as never);
    case 'gt':
      return Query.greaterThan(field, value as never);
    case 'gte':
      return Query.greaterThanEqual(field, value as never);
    case 'contains':
      return Query.contains(field, value as never);
    case 'search':
      return Query.search(field, String(value ?? ''));
    case 'isNull':
      return Query.isNull(field);
    case 'notNull':
      return Query.isNotNull(field);
  }
}

function toSortQuery(sort: Sort): string {
  return sort.dir === 'asc' ? Query.orderAsc(sort.field) : Query.orderDesc(sort.field);
}

/** Appwrite giới hạn 100 row/lần; `all()` phải phân trang cho tới hết. */
const PAGE_SIZE = 100;

export function createAppwriteStore(): DataStore {
  const tablesDB = new TablesDB(createClient());
  const databaseId = env().APPWRITE_DATABASE_ID;

  async function listRows<T extends Row>(
    table: TableName,
    options?: QueryOptions,
  ): Promise<Page<T>> {
    const response = await tablesDB.listRows({
      databaseId,
      tableId: table,
      queries: buildQueries(table, options),
    });
    return {
      rows: response.rows.map((r) => toRow<T>(table, r as unknown as Record<string, unknown>)),
      total: response.total,
    };
  }

  const store: DataStore = {
    list: listRows,

    async all<T extends Row>(table: TableName, options?: QueryOptions): Promise<T[]> {
      const out: T[] = [];
      let offset = options?.offset ?? 0;
      for (;;) {
        const page = await listRows<T>(table, { ...options, limit: PAGE_SIZE, offset });
        out.push(...page.rows);
        offset += PAGE_SIZE;
        if (out.length >= page.total || page.rows.length === 0) break;
      }
      return out;
    },

    async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
      try {
        const row = await tablesDB.getRow({ databaseId, tableId: table, rowId: id });
        return toRow<T>(table, row as unknown as Record<string, unknown>);
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw error;
      }
    },

    async insert<T extends Row>(
      table: TableName,
      row: Omit<T, 'created_at' | 'updated_at'>,
    ): Promise<T> {
      const created = await tablesDB.createRow({
        databaseId,
        tableId: table,
        rowId: (row as { id?: string }).id || ID.unique(),
        data: toPayload(table, row as Record<string, unknown>),
      });
      return toRow<T>(table, created as unknown as Record<string, unknown>);
    },

    async upsert<T extends Row>(
      table: TableName,
      row: Omit<T, 'created_at' | 'updated_at'>,
    ): Promise<T> {
      const upserted = await tablesDB.upsertRow({
        databaseId,
        tableId: table,
        rowId: (row as { id?: string }).id || ID.unique(),
        data: toPayload(table, row as Record<string, unknown>),
      });
      return toRow<T>(table, upserted as unknown as Record<string, unknown>);
    },

    async update<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
      const updated = await tablesDB.updateRow({
        databaseId,
        tableId: table,
        rowId: id,
        data: toPayload(table, patch as Record<string, unknown>),
      });
      return toRow<T>(table, updated as unknown as Record<string, unknown>);
    },

    async delete(table: TableName, id: string): Promise<void> {
      await tablesDB.deleteRow({ databaseId, tableId: table, rowId: id });
    },

    async updateMany(
      table: TableName,
      updates: { id: string; patch: Record<string, unknown> }[],
    ): Promise<void> {
      for (const { id, patch } of updates) {
        await tablesDB.updateRow({
          databaseId,
          tableId: table,
          rowId: id,
          data: toPayload(table, patch),
        });
      }
    },

    async transaction<R>(fn: (tx: DataStore) => Promise<R>): Promise<R> {
      // TablesDB có transaction thật; ở MVP các mutation đi qua `withMutation()` đã tuần tự hóa
      // và có bước tính lại + audit ở cuối, nên dùng chung handle là đủ. Khi bật transaction
      // thật, chỉ cần bọc `createTransaction`/`createOperations` tại đây — service không đổi.
      return fn(store);
    },

    async ping() {
      try {
        await tablesDB.listRows({
          databaseId,
          tableId: 'system_settings',
          queries: [Query.limit(1)],
        });
        return { ok: true, driver: 'appwrite' };
      } catch (error) {
        return { ok: false, driver: 'appwrite', detail: (error as Error).message };
      }
    },
  };

  return store;
}
