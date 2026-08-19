/**
 * Đối chiếu schema thật trên Appwrite với khai báo trong `src/server/db/schema.ts`.
 *
 *   npm run verify:schema
 *
 * Dùng trong CI trước khi deploy: thoát mã ≠ 0 nếu thiếu bảng/cột/index, để không bao giờ
 * deploy code mới lên một database chưa được bootstrap (guideline 14.7).
 */

import './lib/load-env';
import { Client, TablesDB } from 'node-appwrite';

import { installAppwriteDnsOverride } from '../src/server/appwrite/dns-override';
import { TABLES, type TableSpec } from '../src/server/db/schema';
import { listAllColumns, listAllIndexes } from './lib/appwrite-metadata';
import { findRequiredGaps } from './lib/required-gaps';

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_SERVER_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'boc_control_tower';

if (!endpoint || !projectId || !apiKey) {
  console.error('Thiếu cấu hình Appwrite — không thể kiểm tra schema.');
  process.exit(1);
}

installAppwriteDnsOverride();
const tablesDB = new TablesDB(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey),
);

interface Problem {
  level: 'error' | 'warning';
  message: string;
}

const problems: Problem[] = [];

async function verifyTable(spec: TableSpec): Promise<void> {
  try {
    await tablesDB.getTable({ databaseId, tableId: spec.id });
  } catch {
    problems.push({ level: 'error', message: `Thiếu bảng "${spec.id}".` });
    return;
  }

  const columnList = await listAllColumns(tablesDB, databaseId, spec.id);
  const actualColumns = new Map(columnList.map((column) => [column.key, column]));

  for (const [key, expected] of Object.entries(spec.columns)) {
    const actual = actualColumns.get(key);
    if (!actual) {
      problems.push({ level: 'error', message: `Bảng ${spec.id} thiếu cột "${key}".` });
      continue;
    }
    if (actual.status && actual.status !== 'available') {
      problems.push({
        level: 'warning',
        message: `Cột ${spec.id}.${key} đang ở trạng thái "${actual.status}".`,
      });
    }
    if (Boolean(expected.required) !== Boolean(actual.required)) {
      problems.push({
        level: 'warning',
        message: `Cột ${spec.id}.${key} khác nhau về ràng buộc bắt buộc (khai báo: ${Boolean(expected.required)}, thực tế: ${Boolean(actual.required)}).`,
      });
    }
  }

  for (const key of actualColumns.keys()) {
    if (!(key in spec.columns)) {
      problems.push({
        level: 'warning',
        message: `Bảng ${spec.id} có cột thừa "${key}" không nằm trong khai báo.`,
      });
    }
  }

  const indexList = await listAllIndexes(tablesDB, databaseId, spec.id);
  const actualIndexes = new Set(indexList.map((index) => index.key));
  for (const index of spec.indexes) {
    if (!actualIndexes.has(index.key)) {
      problems.push({ level: 'error', message: `Bảng ${spec.id} thiếu index "${index.key}".` });
    }
  }
}

async function main(): Promise<void> {
  console.log(`Kiểm tra schema trên ${endpoint} / database ${databaseId}\n`);

  for (const spec of Object.values(TABLES) as TableSpec[]) {
    await verifyTable(spec);
  }

  // So metadata thôi thì không đủ: cột đúng, ràng buộc đúng, nhưng bản ghi cũ vẫn có thể thiếu giá
  // trị ở cột bắt buộc — và khi đó mọi lần ghi lên chúng đều lỗi 400 dù màn hình đọc vẫn bình thường.
  for (const gap of await findRequiredGaps(tablesDB, databaseId)) {
    problems.push({
      level: 'error',
      message:
        `Bảng ${gap.table}: ${gap.count} bản ghi thiếu giá trị ở cột bắt buộc "${gap.column}" — ` +
        'mọi thao tác cập nhật lên các bản ghi này sẽ lỗi "Missing required attribute".',
    });
  }

  const errors = problems.filter((p) => p.level === 'error');
  const warnings = problems.filter((p) => p.level === 'warning');

  if (problems.length === 0) {
    console.log('✓ Schema khớp hoàn toàn với khai báo.');
    return;
  }

  for (const problem of errors) console.error(`✗ ${problem.message}`);
  for (const problem of warnings) console.warn(`⚠ ${problem.message}`);

  console.log(`\n${errors.length} lỗi · ${warnings.length} cảnh báo`);
  if (errors.length > 0) {
    console.error('\nChạy `npm run bootstrap:appwrite` trước khi deploy.');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
