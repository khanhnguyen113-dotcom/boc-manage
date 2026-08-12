/**
 * Chẩn đoán trạng thái column trên Appwrite.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/diagnose-columns.ts [tableId]
 *
 * Appwrite tạo column bất đồng bộ qua worker. Nếu container `appwrite-worker-databases` không
 * chạy, column sẽ kẹt vĩnh viễn ở `processing` và mọi index phụ thuộc đều không tạo được —
 * script này chỉ ra chính xác điều đó thay vì để bootstrap chờ tới hết giờ.
 */

import './lib/load-env';

import { Client, TablesDB } from 'node-appwrite';

import { installAppwriteDnsOverride } from '../src/server/appwrite/dns-override';
import { TABLE_NAMES, type TableName } from '../src/server/db/schema';
import { listAllColumns } from './lib/appwrite-metadata';

installAppwriteDnsOverride();

const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'boc_control_tower';
const tablesDB = new TablesDB(
  new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_SERVER_API_KEY!),
);

const only = process.argv[2] as TableName | undefined;

async function main(): Promise<void> {
  const targets = only ? [only] : TABLE_NAMES;
  const totals: Record<string, number> = {};

  for (const tableId of targets) {
    let columns;
    try {
      columns = await listAllColumns(tablesDB, databaseId, tableId);
    } catch {
      console.log(`${tableId.padEnd(24)} — chưa có bảng`);
      continue;
    }

    const byStatus = new Map<string, string[]>();
    for (const column of columns) {
      const status = column.status ?? 'unknown';
      totals[status] = (totals[status] ?? 0) + 1;
      const bucket = byStatus.get(status) ?? [];
      bucket.push(column.key);
      byStatus.set(status, bucket);
    }

    const summary = [...byStatus.entries()]
      .map(([status, keys]) => `${status}:${keys.length}`)
      .join(' · ');
    console.log(`${tableId.padEnd(24)} ${String(columns.length).padStart(3)} cột — ${summary}`);

    for (const [status, keys] of byStatus) {
      if (status === 'available') continue;
      console.log(`    ${status}: ${keys.join(', ')}`);
    }
  }

  console.log('\nTổng theo trạng thái:', JSON.stringify(totals));
  if ((totals.processing ?? 0) > 0) {
    console.log(
      '\n⚠ Có column kẹt ở "processing". Appwrite xử lý việc này bằng worker nền —\n' +
        '  kiểm tra container `appwrite-worker-databases` trên server có đang chạy không.',
    );
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
