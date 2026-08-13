import 'server-only';

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { env } from '@/config/env';

import { TABLE_NAMES, type TableName } from './schema';
import {
  compareRows,
  matchesFilter,
  type DataStore,
  type Page,
  type QueryOptions,
  type Row,
} from './store';

/**
 * Driver dữ liệu cho môi trường development (ADR-003).
 *
 * Toàn bộ dữ liệu nằm trong một file JSON. Không dùng cho staging/production — `config/env.ts`
 * chặn cứng ở `NODE_ENV=production`. Mục đích: chạy được UI, viết được test tích hợp và demo
 * nghiệm thu khi Appwrite instance của BOC chưa sẵn sàng.
 *
 * Vẫn giữ đúng hợp đồng của `DataStore`: lọc/sắp xếp/phân trang thực hiện tại đây (phía server),
 * ghi nhiều bảng đi qua `transaction()`.
 */

type Database = Record<TableName, Row[]>;

function emptyDatabase(): Database {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, [] as Row[]])) as unknown as Database;
}

function dataFilePath(): string {
  // Đường dẫn lấy từ cấu hình runtime nên bundler không phân tích tĩnh được — đây là chủ ý:
  // file dữ liệu nằm ngoài bundle và chỉ tồn tại ở môi trường development (ADR-003).
  return resolve(/* turbopackIgnore: true */ process.cwd(), env().LOCAL_DATA_FILE);
}

/** Hàng đợi ghi — Node đơn luồng nhưng request đồng thời vẫn có thể xen kẽ giữa các `await`. */
let writeQueue: Promise<unknown> = Promise.resolve();

function serialize<R>(fn: () => Promise<R>): Promise<R> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => undefined);
  return next;
}

let cache: { db: Database; mtime: number } | null = null;

function loadDatabase(): Database {
  const file = dataFilePath();
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Database>;
    const db = emptyDatabase();
    for (const name of TABLE_NAMES) {
      if (Array.isArray(parsed[name])) db[name] = parsed[name] as Row[];
    }
    return db;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDatabase();
    throw new Error(
      `Không đọc được kho dữ liệu local tại ${file}. Chạy \`npm run seed\` để khởi tạo. (${String(error)})`,
    );
  }
}

function readDatabase(): Database {
  if (!cache) cache = { db: loadDatabase(), mtime: Date.now() };
  return cache.db;
}

function persist(db: Database): void {
  const file = dataFilePath();
  mkdirSync(dirname(file), { recursive: true });
  // Ghi ra file tạm rồi rename: tránh file JSON hỏng nếu tiến trình chết giữa chừng.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  cache = { db, mtime: Date.now() };
}

function nowIso(): string {
  return new Date().toISOString();
}

function applyQuery<T extends Row>(rows: Row[], options?: QueryOptions): { rows: T[]; total: number } {
  let result = rows;

  if (options?.filters?.length) {
    result = result.filter((row) => options.filters!.every((f) => matchesFilter(row, f)));
  }

  const total = result.length;

  if (options?.sort?.length) {
    result = [...result].sort((a, b) => compareRows(a, b, options.sort!));
  }

  const offset = options?.offset ?? 0;
  const limit = options?.limit;
  if (offset > 0 || limit !== undefined) {
    result = result.slice(offset, limit === undefined ? undefined : offset + limit);
  }

  return { rows: result as T[], total };
}

function createHandle(getDb: () => Database, onMutate: (db: Database) => void): DataStore {
  return {
    async list<T extends Row>(table: TableName, options?: QueryOptions): Promise<Page<T>> {
      return applyQuery<T>(getDb()[table], options);
    },

    async all<T extends Row>(table: TableName, options?: QueryOptions): Promise<T[]> {
      return applyQuery<T>(getDb()[table], options).rows;
    },

    async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
      return (getDb()[table].find((r) => r.id === id) as T | undefined) ?? null;
    },

    async insert<T extends Row>(
      table: TableName,
      row: Omit<T, 'created_at' | 'updated_at'>,
    ): Promise<T> {
      const db = getDb();
      const timestamp = nowIso();
      const record = {
        ...(row as object),
        id: (row as { id?: string }).id || randomUUID(),
        created_at: timestamp,
        updated_at: timestamp,
      } as T;
      db[table].push(record);
      onMutate(db);
      return record;
    },

    async upsert<T extends Row>(
      table: TableName,
      row: Omit<T, 'created_at' | 'updated_at'>,
    ): Promise<T> {
      const db = getDb();
      const id = (row as { id?: string }).id || randomUUID();
      const index = db[table].findIndex((r) => r.id === id);
      const timestamp = nowIso();
      const record = {
        ...(row as object),
        id,
        created_at: index === -1 ? timestamp : db[table][index].created_at,
        updated_at: timestamp,
      } as T;

      if (index === -1) db[table].push(record);
      else db[table][index] = record;

      onMutate(db);
      return record;
    },

    async update<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
      const db = getDb();
      const index = db[table].findIndex((r) => r.id === id);
      if (index === -1) throw new Error(`Không tìm thấy bản ghi ${table}/${id}.`);
      const updated = { ...db[table][index], ...patch, updated_at: nowIso() } as T;
      db[table][index] = updated;
      onMutate(db);
      return updated;
    },

    async delete(table: TableName, id: string): Promise<void> {
      const db = getDb();
      const index = db[table].findIndex((row) => row.id === id);
      if (index === -1) return;
      db[table].splice(index, 1);
      onMutate(db);
    },

    async updateMany(
      table: TableName,
      updates: { id: string; patch: Record<string, unknown> }[],
    ): Promise<void> {
      const db = getDb();
      const timestamp = nowIso();
      const byId = new Map(updates.map((u) => [u.id, u.patch]));
      db[table] = db[table].map((row) => {
        const patch = byId.get(row.id);
        return patch ? { ...row, ...patch, updated_at: timestamp } : row;
      });
      onMutate(db);
    },

    async transaction<R>(fn: (tx: DataStore) => Promise<R>): Promise<R> {
      return serialize(async () => {
        // Bản sao sâu: nếu `fn` ném lỗi thì bản gốc không bị chạm tới.
        const snapshot = structuredClone(readDatabase());
        const handle = createHandle(
          () => snapshot,
          () => undefined,
        );
        const result = await fn(handle);
        persist(snapshot);
        return result;
      });
    },

    async ping() {
      try {
        const db = readDatabase();
        const count = TABLE_NAMES.reduce((sum, name) => sum + db[name].length, 0);
        return {
          ok: count > 0,
          driver: 'local',
          detail: count > 0 ? `${count} bản ghi` : 'Kho dữ liệu rỗng — chạy `npm run seed`.',
        };
      } catch (error) {
        return { ok: false, driver: 'local', detail: String(error) };
      }
    },
  };
}

export function createLocalStore(): DataStore {
  const base = createHandle(readDatabase, persist);

  // Ghi lẻ (không nằm trong transaction) vẫn phải xếp hàng để không mất dữ liệu.
  return {
    ...base,
    insert: (table, row) => serialize(() => base.insert(table, row)),
    upsert: (table, row) => serialize(() => base.upsert(table, row)),
    update: (table, id, patch) => serialize(() => base.update(table, id, patch)),
    updateMany: (table, updates) => serialize(() => base.updateMany(table, updates)),
  } as DataStore;
}

/** Dùng bởi `scripts/seed.ts`. */
export function writeDatabaseSnapshot(db: Partial<Database>): void {
  const full = emptyDatabase();
  for (const name of TABLE_NAMES) {
    if (db[name]) full[name] = db[name] as Row[];
  }
  persist(full);
}
