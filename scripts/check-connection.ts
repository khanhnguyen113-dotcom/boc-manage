/**
 * Kiểm tra nhanh kết nối tới Appwrite trước khi bootstrap/seed.
 *
 *   npm run check:appwrite
 *
 * In ra: DNS đang dùng, danh sách database và số bản ghi từng bảng — đủ để biết server sẵn sàng
 * hay chưa mà **không ghi** bất kỳ dữ liệu nào. Dùng luôn TablesDB thay vì API databases cũ để
 * nhất quán với phần còn lại của hệ thống (guideline mục 0.13).
 */

import './lib/load-env';

import { Client, TablesDB } from 'node-appwrite';

import { installAppwriteDnsOverride } from '../src/server/appwrite/dns-override';
import { TABLE_NAMES } from '../src/server/db/schema';

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_SERVER_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'boc_control_tower';

if (!endpoint || !projectId || !apiKey) {
  console.error('Thiếu APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_SERVER_API_KEY.');
  process.exit(1);
}

const dns = installAppwriteDnsOverride();
const tablesDB = new TablesDB(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey),
);

async function main(): Promise<void> {
  console.log(`Endpoint : ${endpoint}`);
  console.log(`Project  : ${projectId}`);
  console.log(`DNS      : ${dns.active ? `ghi đè ${dns.detail}` : 'theo hệ thống'}`);
  if (endpoint!.startsWith('http://')) {
    console.log('⚠ Endpoint dùng HTTP — API key đi qua mạng KHÔNG mã hóa.');
  }
  console.log('');

  const databases = await tablesDB.list();
  console.log(`Kết nối OK. Database hiện có (${databases.total}):`);
  for (const db of databases.databases) {
    console.log(`  - ${db.$id} · ${db.name}`);
  }

  if (!databases.databases.some((db) => db.$id === databaseId)) {
    console.log(`\n“${databaseId}” chưa tồn tại — chạy \`npm run bootstrap:appwrite\`.`);
    return;
  }

  const tables = await tablesDB.listTables({ databaseId });
  const present = new Set(tables.tables.map((t) => t.$id));
  const missing = TABLE_NAMES.filter((name) => !present.has(name));

  console.log(`\nBảng trong “${databaseId}” (${tables.total}/${TABLE_NAMES.length}):`);

  let totalRows = 0;
  for (const table of tables.tables) {
    const rows = await tablesDB.listRows({ databaseId, tableId: table.$id });
    totalRows += rows.total;
    console.log(`  ${table.$id.padEnd(24)} ${String(rows.total).padStart(5)} bản ghi`);
  }

  console.log(`\nTổng cộng: ${totalRows} bản ghi.`);
  if (missing.length > 0) {
    console.log(`Thiếu ${missing.length} bảng: ${missing.join(', ')}`);
    console.log('→ Chạy `npm run bootstrap:appwrite`.');
  }
}

main().catch((error: unknown) => {
  console.error('\n✗ Không kết nối được:', (error as Error).message);
  process.exit(1);
});
