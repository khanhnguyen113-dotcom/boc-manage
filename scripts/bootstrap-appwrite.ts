/**
 * Tạo database / table / column / index / bucket trên Appwrite TablesDB.
 *
 *   npm run bootstrap:appwrite
 *
 * Guideline 14.7 — bắt buộc:
 * - **Idempotent**: chạy lại nhiều lần không lỗi, không tạo trùng.
 * - **Chờ column sẵn sàng** trước khi tạo index phụ thuộc.
 * - **Không tự xóa/sửa schema production** không tương thích — chỉ báo drift để người vận hành
 *   quyết định.
 * - Sinh `appwrite-schema-manifest.json` để CI đối chiếu.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import './lib/load-env';
import { Client, Permission, Role, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite';

import { installAppwriteDnsOverride } from '../src/server/appwrite/dns-override';
import { listAllColumns, listAllIndexes, type ColumnInfo } from './lib/appwrite-metadata';
import { backfillRequiredGaps, findRequiredGaps } from './lib/required-gaps';
import {
  ALLOWED_FILE_EXTENSIONS,
  BUCKETS,
  TABLES,
  type ColumnSpec,
  type TableSpec,
} from '../src/server/db/schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_SERVER_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'boc_control_tower';

if (!endpoint || !projectId || !apiKey) {
  console.error(
    'Thiếu APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_SERVER_API_KEY trong môi trường.',
  );
  process.exit(1);
}

const dns = installAppwriteDnsOverride();
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

/** Ánh xạ kiểu index của schema sang enum của SDK. */
const INDEX_TYPES = {
  key: TablesDBIndexType.Key,
  unique: TablesDBIndexType.Unique,
  fulltext: TablesDBIndexType.Fulltext,
} as const;

const drift: string[] = [];
let created = 0;
let skipped = 0;

function isNotFound(error: unknown): boolean {
  return (error as { code?: number }).code === 404;
}

function isDuplicate(error: unknown): boolean {
  return (error as { code?: number }).code === 409;
}

async function ensureDatabase(): Promise<void> {
  try {
    await tablesDB.get({ databaseId });
    console.log(`✓ Database "${databaseId}" đã có`);
    skipped += 1;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await tablesDB.create({ databaseId, name: 'BOC Control Tower' });
    console.log(`+ Tạo database "${databaseId}"`);
    created += 1;
  }
}

async function ensureTable(spec: TableSpec): Promise<void> {
  try {
    await tablesDB.getTable({ databaseId, tableId: spec.id });
    skipped += 1;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await tablesDB.createTable({
      databaseId,
      tableId: spec.id,
      name: spec.name,
      // ADR-010: không cấp quyền cho client. Chỉ server dùng API key mới truy cập được.
      permissions: [Permission.read(Role.label('never'))],
      rowSecurity: false,
    });
    console.log(`+ Tạo bảng ${spec.id}`);
    created += 1;
  }
}

async function existingColumns(tableId: string): Promise<Map<string, ColumnInfo>> {
  const columns = await listAllColumns(tablesDB, databaseId, tableId);
  return new Map(columns.map((column) => [column.key, column]));
}

const APPWRITE_INT64_MIN = '-9223372036854775808';
const APPWRITE_INT64_MAX = '9223372036854775807';

function normalizedIntegerBound(
  value: number | bigint | null | undefined,
  unconstrainedValue: string,
): number | undefined {
  if (value == null || String(value) === unconstrainedValue) return undefined;
  return Number(value);
}

async function ensureColumn(tableId: string, key: string, spec: ColumnSpec): Promise<void> {
  const base = { databaseId, tableId, key };

  try {
    switch (spec.kind) {
      case 'varchar':
        await tablesDB.createStringColumn({
          ...base,
          size: spec.size,
          required: spec.required ?? false,
          array: spec.array ?? false,
          xdefault: spec.required ? undefined : (spec.default ?? undefined),
        });
        break;
      case 'text':
        await tablesDB.createStringColumn({
          ...base,
          size: 100_000,
          required: spec.required ?? false,
        });
        break;
      case 'integer':
        await tablesDB.createIntegerColumn({
          ...base,
          required: spec.required ?? false,
          min: spec.min,
          max: spec.max,
          xdefault: spec.required ? undefined : spec.default,
        });
        break;
      case 'float':
        await tablesDB.createFloatColumn({
          ...base,
          required: spec.required ?? false,
          min: spec.min,
          max: spec.max,
          xdefault: spec.required ? undefined : spec.default,
        });
        break;
      case 'boolean':
        await tablesDB.createBooleanColumn({
          ...base,
          required: spec.required ?? false,
          xdefault: spec.required ? undefined : spec.default,
        });
        break;
      case 'datetime':
        await tablesDB.createDatetimeColumn({ ...base, required: spec.required ?? false });
        break;
      case 'enum':
        await tablesDB.createEnumColumn({
          ...base,
          elements: [...spec.values],
          required: spec.required ?? false,
          xdefault: spec.required ? undefined : spec.default,
        });
        break;
      case 'email':
        await tablesDB.createEmailColumn({ ...base, required: spec.required ?? false });
        break;
      case 'url':
        await tablesDB.createUrlColumn({ ...base, required: spec.required ?? false });
        break;
    }
    created += 1;
  } catch (error) {
    if (isDuplicate(error)) {
      if (spec.kind === 'integer') {
        const actual = (await existingColumns(tableId)).get(key);
        const actualMin = normalizedIntegerBound(actual?.min, APPWRITE_INT64_MIN);
        const actualMax = normalizedIntegerBound(actual?.max, APPWRITE_INT64_MAX);
        if (actualMin !== spec.min || actualMax !== spec.max) {
          await tablesDB.updateIntegerColumn({
            databaseId,
            tableId,
            key,
            required: spec.required ?? false,
            // SDK bỏ trường undefined (khiến giới hạn cũ còn nguyên), nên gửi biên int64 đầy đủ
            // để biểu thị cột không có giới hạn nghiệp vụ.
            min: spec.min ?? BigInt(APPWRITE_INT64_MIN),
            max: spec.max ?? BigInt(APPWRITE_INT64_MAX),
            // Appwrite yêu cầu trường `default` khi update và dùng null để biểu thị không có default;
            // type của SDK 27.1.0 chưa phản ánh giá trị null hợp lệ này.
            xdefault: (spec.required ? null : (spec.default ?? null)) as unknown as number,
          });
          console.log(`~ Mở rộng ràng buộc số ${tableId}.${key}`);
          created += 1;
          return;
        }
      }
      skipped += 1;
      return;
    }
    throw error;
  }
}

/**
 * Index chỉ tạo được khi mọi column liên quan đã ở trạng thái `available`.
 *
 * Appwrite tạo column bất đồng bộ; với bảng nhiều cột như `work_items` (45 cột) trên server ở xa,
 * hàng đợi có thể mất vài phút. Chờ **một lần cho cả bảng** thay vì chờ lại ở từng index, và in
 * tiến trình để người vận hành biết hệ thống đang chờ chứ không phải treo.
 */
async function waitForColumns(
  tableId: string,
  keys: string[],
  timeoutMs = 300_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let announced = false;

  for (;;) {
    const columns = await existingColumns(tableId);
    const pending = keys.filter((key) => columns.get(key)?.status !== 'available');

    if (pending.length === 0) {
      if (announced) process.stdout.write(' xong\n');
      return;
    }

    const failed = keys.filter((key) => columns.get(key)?.status === 'failed');
    if (failed.length > 0) {
      throw new Error(`Column tạo thất bại ở bảng ${tableId}: ${failed.join(', ')}`);
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Quá thời gian chờ column sẵn sàng ở bảng ${tableId}: ${pending.join(', ')}. ` +
          'Chạy lại lệnh — script idempotent nên sẽ tiếp tục từ chỗ đang dở.',
      );
    }

    if (!announced) {
      process.stdout.write(`  … chờ ${pending.length} column của ${tableId} sẵn sàng`);
      announced = true;
    } else {
      process.stdout.write('.');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function ensureIndexes(spec: TableSpec): Promise<void> {
  const indexes = await listAllIndexes(tablesDB, databaseId, spec.id);
  const existing = new Set(indexes.map((index) => index.key));

  const missing = spec.indexes.filter((index) => !existing.has(index.key));
  if (missing.length === 0) {
    skipped += spec.indexes.length;
    return;
  }

  // Chờ toàn bộ column của bảng một lần, thay vì chờ lặp lại cho từng index.
  await waitForColumns(spec.id, Object.keys(spec.columns));

  for (const index of spec.indexes) {
    if (existing.has(index.key)) {
      skipped += 1;
      continue;
    }

    try {
      await tablesDB.createIndex({
        databaseId,
        tableId: spec.id,
        key: index.key,
        type: INDEX_TYPES[index.type],
        columns: index.columns,
      });
      console.log(`  + index ${spec.id}.${index.key}`);
      created += 1;
    } catch (error) {
      if (isDuplicate(error)) {
        skipped += 1;
        continue;
      }
      // Fulltext có giới hạn tuỳ phiên bản/engine — ghi drift thay vì làm hỏng cả lần chạy.
      drift.push(`Không tạo được index ${spec.id}.${index.key}: ${(error as Error).message}`);
    }
  }
}

/** Trần cứng của Appwrite self-hosted mặc định (`_APP_STORAGE_LIMIT`). */
const SERVER_MAX_FILE_BYTES = 30_000_000;

async function ensureBuckets(): Promise<void> {
  for (const bucket of BUCKETS) {
    try {
      await storage.getBucket({ bucketId: bucket.id });
      skipped += 1;
      continue;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }

    const requested = bucket.maxFileSizeMb * 1024 * 1024;
    const maximumFileSize = Math.min(requested, SERVER_MAX_FILE_BYTES);
    if (maximumFileSize < requested) {
      drift.push(
        `Bucket ${bucket.id}: server chỉ cho tối đa ${SERVER_MAX_FILE_BYTES} byte, ` +
          `đã hạ từ ${requested} byte. Tăng \`_APP_STORAGE_LIMIT\` phía Appwrite nếu cần file lớn hơn.`,
      );
    }

    await storage.createBucket({
      bucketId: bucket.id,
      name: bucket.name,
      // ADR-010: không cấp quyền cho client; truy cập file luôn qua server sau khi kiểm quyền.
      permissions: [],
      fileSecurity: true,
      enabled: true,
      maximumFileSize,
      allowedFileExtensions: [...ALLOWED_FILE_EXTENSIONS],
      encryption: true,
      antivirus: true,
    });
    console.log(`+ Tạo bucket ${bucket.id} (tối đa ${Math.round(maximumFileSize / 1024 / 1024)} MB)`);
    created += 1;
  }
}

/** Cột có trên Appwrite nhưng không có trong khai báo ⇒ báo, KHÔNG tự xóa. */
async function detectDrift(spec: TableSpec): Promise<void> {
  const columns = await existingColumns(spec.id);
  const declared = new Set(Object.keys(spec.columns));
  for (const key of columns.keys()) {
    if (!declared.has(key)) {
      drift.push(`Bảng ${spec.id} có cột thừa "${key}" không nằm trong khai báo schema.`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Appwrite : ${endpoint}`);
  console.log(`Project  : ${projectId}`);
  console.log(`Database : ${databaseId}`);
  if (dns.active) console.log(`DNS      : ghi đè ${dns.detail}`);
  console.log('');

  await ensureDatabase();

  for (const spec of Object.values(TABLES) as TableSpec[]) {
    await ensureTable(spec);
    for (const [key, column] of Object.entries(spec.columns)) {
      await ensureColumn(spec.id, key, column);
    }
  }

  console.log('\nChờ column sẵn sàng rồi tạo index…');
  for (const spec of Object.values(TABLES) as TableSpec[]) {
    await ensureIndexes(spec);
    await detectDrift(spec);
  }

  await ensureBuckets();

  // Cột bắt buộc thêm vào bảng đã có dữ liệu ⇒ bản ghi cũ mang null ⇒ MỌI lần update sau đó hỏng
  // (Appwrite kiểm tra cả row, không riêng phần patch). Vá ngay tại đây vì chỉ bootstrap mới biết
  // giá trị mặc định đã khai báo — Appwrite không cho đặt `default` trên cột required.
  console.log('\nKiểm tra bản ghi cũ thiếu giá trị ở cột bắt buộc…');
  const gaps = await findRequiredGaps(tablesDB, databaseId);
  if (gaps.length === 0) {
    console.log('  ✓ Không có bản ghi nào thiếu.');
  } else {
    for (const gap of gaps) {
      console.log(
        `  - ${gap.table}.${gap.column}: ${gap.count} bản ghi thiếu` +
          (gap.fallback === undefined ? ' (KHÔNG có mặc định khai báo)' : ` → điền ${JSON.stringify(gap.fallback)}`),
      );
    }
    const { patched, manual } = await backfillRequiredGaps(tablesDB, databaseId, gaps, (line) =>
      console.log(line),
    );
    console.log(`  ✓ Đã điền ${patched} bản ghi.`);
    for (const gap of manual) {
      drift.push(
        `Bảng ${gap.table} có ${gap.count} bản ghi thiếu cột bắt buộc "${gap.column}" và schema ` +
          'không khai báo giá trị mặc định — phải quyết định giá trị rồi điền thủ công, nếu không ' +
          'mọi thao tác ghi lên các bản ghi này đều lỗi.',
      );
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    database_id: databaseId,
    tables: Object.values(TABLES).map((spec) => ({
      id: spec.id,
      name: spec.name,
      append_only: Boolean((spec as TableSpec).appendOnly),
      columns: Object.entries(spec.columns).map(([key, column]) => ({ key, ...column })),
      indexes: spec.indexes,
    })),
    buckets: BUCKETS,
  };

  writeFileSync(
    resolve(ROOT, 'appwrite-schema-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`\nTạo mới: ${created} · Bỏ qua (đã có): ${skipped}`);
  console.log('Đã ghi appwrite-schema-manifest.json');

  if (drift.length > 0) {
    console.log('\n⚠ Phát hiện khác biệt schema — cần người vận hành xử lý thủ công:');
    for (const line of drift) console.log(`  - ${line}`);
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
