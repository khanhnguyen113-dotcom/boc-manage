/**
 * Import dữ liệu từ bản chụp Google Sheet vào kho dữ liệu đang cấu hình.
 *
 *   npm run import:dry-run       # chỉ đối soát, KHÔNG ghi
 *   npm run import:production    # ghi thật, cần xác nhận
 *
 * Guideline mục 12. Ràng buộc quan trọng:
 * - Không bao giờ sửa Sheet nguồn (script chỉ đọc file .xlsx đã chụp).
 * - Không import giá trị dẫn xuất — tính lại bằng domain service của webapp.
 * - Orphan và dòng có lỗi công thức là LỖI, không tạo cha giả để "chữa".
 * - Idempotent: id sinh tất định từ mã nghiệp vụ, chạy lại không tạo bản trùng.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import './lib/load-env';

import { recalculateTree } from '../src/domain/recalc';
import type { CategoryCode, WorkItem } from '../src/domain/types';
import { getStore, type Row } from '../src/server/db/store';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

interface ExtractionReport {
  source_file: string;
  source_sha256: string;
  totals: { rows_found: number; rows_accepted: number; rows_rejected: number };
  issues: {
    source_sheet: string;
    source_row: number;
    code: string | null;
    field: string | null;
    error_code: string;
    message: string;
    raw_value: string | null;
  }[];
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, 'data/seed', name), 'utf8')) as T;
}

async function main(): Promise<void> {
  const report = readJson<ExtractionReport>('extraction-report.json');

  console.log(`Chế độ     : ${DRY_RUN ? 'DRY-RUN (không ghi dữ liệu)' : 'PRODUCTION (ghi thật)'}`);
  console.log(`Nguồn      : ${report.source_file}`);
  console.log(`SHA-256    : ${report.source_sha256}`);
  console.log(`Dòng đọc   : ${report.totals.rows_found}`);
  console.log(`Chấp nhận  : ${report.totals.rows_accepted}`);
  console.log(`Bị loại    : ${report.totals.rows_rejected}\n`);

  if (report.issues.length > 0) {
    const grouped = new Map<string, number>();
    for (const issue of report.issues) {
      grouped.set(issue.error_code, (grouped.get(issue.error_code) ?? 0) + 1);
    }
    console.log('Vấn đề dữ liệu tại nguồn:');
    for (const [code, count] of grouped) console.log(`  ${code}: ${count}`);
    console.log('');
  }

  const store = await getStore();
  const jobId = randomUUID();
  const startedAt = new Date().toISOString();

  // --- đối soát với dữ liệu đang có ---------------------------------------
  const existing = await store.all<Row & WorkItem>('work_items');
  const byCode = new Map(existing.map((item) => [item.code, item]));

  const seedItems = readJson<{ code: string; level: string; title: string }[]>('work-items.json');
  const toCreate = seedItems.filter((row) => !byCode.has(row.code));
  const toUpdate = seedItems.filter((row) => byCode.has(row.code));
  const orphanedInDb = existing.filter(
    (item) => item.legacy_code && !seedItems.some((row) => row.code === item.legacy_code),
  );

  console.log('Đối soát với dữ liệu hiện tại:');
  console.log(`  Sẽ tạo mới      : ${toCreate.length}`);
  console.log(`  Sẽ cập nhật     : ${toUpdate.length}`);
  console.log(`  Có trong hệ thống nhưng không còn ở nguồn: ${orphanedInDb.length}`);
  if (orphanedInDb.length > 0) {
    console.log(
      `    ${orphanedInDb.slice(0, 10).map((i) => i.code).join(', ')}${orphanedInDb.length > 10 ? '…' : ''}`,
    );
    console.log('    → KHÔNG tự xóa. Người phụ trách dữ liệu quyết định lưu trữ hay giữ lại.');
  }

  // --- kiểm tra derived có khớp không (guideline 12.5) ---------------------
  if (existing.length > 0) {
    const categories = await store.all<Row & { code: string }>('work_categories');
    const categoryById = new Map(categories.map((c) => [c.id, c.code as CategoryCode]));
    const { changedIds } = recalculateTree(existing, {
      categoryCodeOf: (item) => categoryById.get(item.category_id) ?? null,
      mode: 'average',
    });

    console.log(`\nĐối soát giá trị dẫn xuất: ${changedIds.size} bản ghi lệch cache.`);
    if (changedIds.size > 0) {
      console.log('  → Chạy lại seed hoặc job tính lại để đồng bộ cache.');
    }
  }

  if (DRY_RUN) {
    console.log('\n✓ Dry-run hoàn tất. Không có dữ liệu nào bị thay đổi.');
    console.log('  Xử lý hết biên bản lỗi ở trên rồi chạy `npm run import:production`.');
    return;
  }

  if (report.issues.some((issue) => issue.error_code !== 'MISSING_TAXONOMY')) {
    console.error(
      '\n✗ Vẫn còn lỗi cấu trúc (orphan/level/công thức) tại nguồn. Import production bị chặn.',
    );
    console.error('  Sửa tại Google Sheet, chụp lại và chạy `npm run extract:sheet`.');
    process.exit(1);
  }

  await store.insert('import_jobs', {
    id: jobId,
    source_name: report.source_file,
    source_checksum: report.source_sha256,
    mode: 'PRODUCTION',
    status: 'RUNNING',
    total_rows: report.totals.rows_found,
    imported_rows: 0,
    error_rows: report.totals.rows_rejected,
    mapping_version: 'v1',
    actor_user_id: 'system',
    started_at: startedAt,
    finished_at: null,
  });

  for (const issue of report.issues) {
    await store.insert('import_errors', {
      id: randomUUID(),
      job_id: jobId,
      source_sheet: issue.source_sheet,
      source_row: issue.source_row,
      field: issue.field,
      error_code: issue.error_code,
      message: issue.message,
      raw_value: issue.raw_value,
    });
  }

  console.log(
    '\nDữ liệu nghiệp vụ được nạp bằng `npm run seed` (cùng bộ mã tất định, idempotent).',
  );
  console.log('Script này ghi nhận phiên import và biên bản lỗi để phục vụ đối soát/ký nghiệm thu.');

  await store.update('import_jobs', jobId, {
    status: 'SUCCEEDED',
    imported_rows: report.totals.rows_accepted,
    finished_at: new Date().toISOString(),
  });

  console.log(`\n✓ Đã ghi phiên import ${jobId}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
