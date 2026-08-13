/**
 * Dọn toàn bộ user mẫu và bootstrap một super admin mới mà không làm mồ côi work_items.
 *
 * Mặc định chỉ dry-run. Muốn thực thi phải truyền đồng thời:
 *   npm run reset:users -- --execute --confirm=RESET-ALL-USERS
 */

import './lib/load-env';

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client, Query, TablesDB, Users } from 'node-appwrite';

import { CAPABILITIES } from '../src/domain/permissions';
import { installAppwriteDnsOverride } from '../src/server/appwrite/dns-override';

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_SERVER_API_KEY || process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'boc_control_tower';
const adminEmail = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.RESET_ADMIN_PASSWORD;
const adminName = process.env.RESET_ADMIN_NAME?.trim() || 'Quản trị hệ thống BOC';
const execute = process.argv.includes('--execute');
const confirmed = process.argv.includes('--confirm=RESET-ALL-USERS');

if (!endpoint || !projectId || !apiKey) {
  throw new Error('Thiếu APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_SERVER_API_KEY.');
}

installAppwriteDnsOverride();
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tables = new TablesDB(client);
const users = new Users(client);

type AppwriteRow = Record<string, unknown> & { $id: string };

async function allRows(tableId: string): Promise<AppwriteRow[]> {
  const output: AppwriteRow[] = [];
  let offset = 0;
  for (;;) {
    const page = await tables.listRows({
      databaseId,
      tableId,
      queries: [Query.limit(100), Query.offset(offset)],
    });
    output.push(...(page.rows as unknown as AppwriteRow[]));
    if (output.length >= page.total || page.rows.length === 0) return output;
    offset += page.rows.length;
  }
}

async function allAuthUsers() {
  const output: Awaited<ReturnType<Users['list']>>['users'] = [];
  let offset = 0;
  for (;;) {
    const page = await users.list({ queries: [Query.limit(100), Query.offset(offset)] });
    output.push(...page.users);
    if (output.length >= page.total || page.users.length === 0) return output;
    offset += page.users.length;
  }
}

async function deleteRows(tableId: string, rows: AppwriteRow[]) {
  for (const row of rows) {
    await tables.deleteRow({ databaseId, tableId, rowId: row.$id });
  }
}

function stableAdminId(email: string) {
  return createHash('sha256').update(`boc-super-admin:${email}`).digest('hex').slice(0, 32);
}

async function main() {
  const [
    authUsers,
    profiles,
    roles,
    scopes,
    grants,
    assignments,
    notifications,
    units,
    items,
    executionLogs,
    comments,
    attachments,
    settings,
    capacities,
  ] =
    await Promise.all([
      allAuthUsers(),
      allRows('profiles'),
      allRows('user_roles'),
      allRows('data_scopes'),
      allRows('user_capabilities'),
      allRows('work_assignments'),
      allRows('notifications'),
      allRows('organizational_units'),
      allRows('work_items'),
      allRows('execution_logs'),
      allRows('comments'),
      allRows('attachments'),
      allRows('system_settings'),
      allRows('capacity_settings'),
    ]);

  console.log('Kế hoạch reset user:');
  console.log(`  Appwrite Auth       : ${authUsers.length} tài khoản cũ`);
  console.log(`  profiles/role/scope : ${profiles.length}/${roles.length}/${scopes.length}`);
  console.log(`  capability grants   : ${grants.length}`);
  console.log(`  phân công cũ        : ${assignments.length}`);
  console.log(`  thông báo cũ        : ${notifications.length}`);
  console.log(`  work_items tái gán  : ${items.length}`);

  if (!execute) {
    console.log('\nDRY-RUN — chưa thay đổi dữ liệu.');
    console.log('Đặt RESET_ADMIN_EMAIL/PASSWORD/NAME rồi chạy với --execute --confirm=RESET-ALL-USERS.');
    return;
  }
  if (!confirmed) throw new Error('Thiếu xác nhận --confirm=RESET-ALL-USERS.');
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error('RESET_ADMIN_EMAIL và RESET_ADMIN_PASSWORD (tối thiểu 12 ký tự) là bắt buộc.');
  }

  const backupDir = resolve('data', 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(
    backupDir,
    `user-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(
    backupPath,
    `${JSON.stringify({
      generated_at: new Date().toISOString(),
      auth_users: authUsers.map(({ $id, email, name, status }) => ({ $id, email, name, status })),
      profiles,
      roles,
      scopes,
      grants,
      assignments,
      notifications,
      work_item_user_references: items.map((item) => ({
        $id: item.$id,
        lead_user_id: item.lead_user_id,
        primary_assignee_id: item.primary_assignee_id,
        created_by: item.created_by,
        updated_by: item.updated_by,
      })),
    }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Backup metadata: ${backupPath}`);

  const adminId = stableAdminId(adminEmail);
  const sameEmail = authUsers.find((user) => user.email.toLowerCase() === adminEmail);
  if (sameEmail) await users.delete({ userId: sameEmail.$id });
  await users.create({ userId: adminId, email: adminEmail, password: adminPassword, name: adminName });

  // Gỡ tham chiếu user nghiệp vụ trước khi xóa hồ sơ cũ.
  for (const item of items) {
    await tables.updateRow({
      databaseId,
      tableId: 'work_items',
      rowId: item.$id,
      data: {
        lead_user_id: null,
        primary_assignee_id: null,
        created_by: adminId,
        updated_by: adminId,
        version: Number(item.version ?? 1) + 1,
      },
    });
  }
  for (const unit of units) {
    if (unit.manager_user_id) {
      await tables.updateRow({
        databaseId,
        tableId: 'organizational_units',
        rowId: unit.$id,
        data: { manager_user_id: null },
      });
    }
  }
  for (const log of executionLogs) {
    await tables.updateRow({
      databaseId,
      tableId: 'execution_logs',
      rowId: log.$id,
      data: {
        responsible_user_id: adminId,
        created_by: adminId,
        updated_by: adminId,
        version: Number(log.version ?? 1) + 1,
      },
    });
  }
  for (const comment of comments) {
    await tables.updateRow({
      databaseId,
      tableId: 'comments',
      rowId: comment.$id,
      data: { author_user_id: adminId, mentioned_user_ids: [], hidden_by: null },
    });
  }
  for (const attachment of attachments) {
    await tables.updateRow({
      databaseId,
      tableId: 'attachments',
      rowId: attachment.$id,
      data: { uploaded_by: adminId },
    });
  }
  for (const setting of settings) {
    await tables.updateRow({
      databaseId,
      tableId: 'system_settings',
      rowId: setting.$id,
      data: { updated_by: adminId, version: Number(setting.version ?? 1) + 1 },
    });
  }

  const userCapacities = capacities.filter((row) => row.scope_type === 'USER');
  await deleteRows('capacity_settings', userCapacities);

  await deleteRows('work_assignments', assignments);
  await deleteRows('notifications', notifications);
  await deleteRows('user_capabilities', grants);
  await deleteRows('data_scopes', scopes);
  await deleteRows('user_roles', roles);
  await deleteRows('profiles', profiles);

  for (const user of authUsers) {
    if (user.$id !== sameEmail?.$id) await users.delete({ userId: user.$id });
  }

  const companyUnit = units.find((unit) => unit.code === 'CTY') ?? units[0];
  await tables.createRow({
    databaseId,
    tableId: 'profiles',
    rowId: randomUUID(),
    data: {
      user_id: adminId,
      employee_code: 'BOC-ADMIN',
      full_name: adminName,
      display_alias: 'Super Admin',
      email: adminEmail,
      primary_unit_id: companyUnit?.$id ?? null,
      job_title: 'Quản trị hệ thống',
      avatar_color: 'brand',
      status: 'ACTIVE',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      capacity_hours_per_day: 8,
      password_hash: null,
      last_seen_at: null,
    },
  });
  await tables.createRow({
    databaseId,
    tableId: 'user_roles',
    rowId: randomUUID(),
    data: {
      user_id: adminId,
      role_code: 'system_admin',
      unit_id: companyUnit?.$id ?? null,
      valid_from: null,
      valid_to: null,
    },
  });
  await tables.createRow({
    databaseId,
    tableId: 'data_scopes',
    rowId: randomUUID(),
    data: {
      user_id: adminId,
      scope_type: 'ALL',
      unit_id: null,
      include_children: true,
      valid_to: null,
    },
  });
  await tables.createRow({
    databaseId,
    tableId: 'audit_logs',
    rowId: randomUUID(),
    data: {
      event_id: randomUUID(),
      actor_user_id: adminId,
      action: 'users.reset_and_super_admin.bootstrap',
      entity_type: 'user',
      entity_id: adminId,
      request_id: null,
      before_json: JSON.stringify({ removed_auth_users: authUsers.length, removed_profiles: profiles.length }),
      after_json: JSON.stringify({ email: adminEmail, role: 'system_admin', capabilities: CAPABILITIES.length }),
      changed_fields: ['auth_users', 'profiles', 'roles', 'scopes', 'assignments'],
      reason: 'BOC yêu cầu xóa user mẫu và bootstrap super admin thật.',
    },
  });

  console.log(`\nĐã reset thành công. Super admin: ${adminEmail} (${adminId})`);
  console.log('Không in mật khẩu ra log. Hãy xóa RESET_ADMIN_* khỏi môi trường sau khi đăng nhập thử.');
}

main().catch((error: unknown) => {
  console.error('\nReset user thất bại:', (error as Error).message);
  process.exit(1);
});
