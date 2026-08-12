/**
 * Nạp dữ liệu nền + dữ liệu trích từ Google Sheet vào kho dữ liệu đang cấu hình.
 *
 *   npm run seed              # DATA_DRIVER trong .env quyết định đích đến
 *
 * Idempotent: id của mọi bản ghi sinh **tất định** từ mã nghiệp vụ (SHA-1), nên chạy lại nhiều
 * lần không tạo bản trùng. Giá trị derived (tiến độ cuộn, ngày hiển thị, chất lượng dữ liệu)
 * **không** lấy từ Sheet mà được tính lại bằng chính domain service của webapp — guideline 12.4.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import './lib/load-env';

import {
  MANAGEMENT_LEVELS,
  SHEET_ALLOCATION_UNIT_MAP,
  SHEET_CATEGORY_MAP,
  SHEET_CYCLE_MAP,
  SHEET_MANAGEMENT_LEVEL_MAP,
  SHEET_SCHEDULE_TYPE_MAP,
  SHEET_STATUS_MAP,
  WORK_CATEGORIES,
  mapSheetValue,
} from '../src/domain/catalogs';
import { computeDepth } from '../src/domain/hierarchy';
import { recalculateTree } from '../src/domain/recalc';
import type {
  CategoryCode,
  ManagementLevelCode,
  Priority,
  WorkItem,
  WorkLevel,
} from '../src/domain/types';
import { hashPassword } from '../src/server/auth/session';
import { TABLE_NAMES, type TableName } from '../src/server/db/schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = resolve(ROOT, 'data/seed');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED_DIR, name), 'utf8')) as T;
}

/** Id tất định 32 ký tự hex — hợp lệ cho cả Appwrite lẫn kho JSON local. */
function stableId(namespace: string, key: string): string {
  return createHash('sha1').update(`${namespace}:${key}`).digest('hex').slice(0, 32);
}

const NOW = new Date().toISOString();

interface SeedWorkItem {
  sourceRow: number;
  code: string;
  level: string;
  parentCode: string | null;
  year: number | null;
  title: string;
  expected_output: string | null;
  value_contribution: string | null;
  unit_name: string | null;
  lead_alias: string | null;
  assignee_alias: string | null;
  status_label: string | null;
  priority: string | null;
  manual_progress: number | null;
  schedule_label: string | null;
  cycle_label: string | null;
  planned_start: string | null;
  planned_end: string | null;
  review_date: string | null;
  estimated_hours_input: number | null;
  allocation_unit_label: string | null;
  allocation_hours: number | null;
  completed_at: string | null;
  result_link: string | null;
  has_children_source: boolean;
  management_level_label: string | null;
  category_label: string | null;
}

interface SeedAccount {
  alias: string | null;
  full_name: string;
  employee_code: string;
  email: string;
  job_title: string;
  unit_code: string;
  roles: string[];
  scope: 'ALL' | 'UNIT' | 'SELF_ASSIGNED';
  capacity_hours_per_day: number;
  avatar_color: string;
  source: string;
  note: string;
}

interface SeedHoliday {
  holiday_date: string;
  name: string;
  year: number;
  source_note: string | null;
  is_confirmed: boolean;
}

/** Mã đơn vị chuẩn hóa từ tên tiếng Việt trong Sheet. */
const UNIT_CODES: Record<string, { code: string; type: 'COMPANY' | 'CENTER' | 'DEPARTMENT' }> = {
  'Công ty': { code: 'CTY', type: 'COMPANY' },
  'Dữ liệu điều hành': { code: 'DLDH', type: 'DEPARTMENT' },
  'R&D': { code: 'RD', type: 'DEPARTMENT' },
  MKT: { code: 'MKT', type: 'DEPARTMENT' },
  'KH & Cung ứng': { code: 'KHCU', type: 'DEPARTMENT' },
  'Kinh doanh quốc tế': { code: 'KDQT', type: 'DEPARTMENT' },
  'QC&QA/Định mức VT': { code: 'QCQA', type: 'DEPARTMENT' },
};

/**
 * L1/L2 mặc định cho các công việc chưa được phân loại trên tab “Lớp 3”.
 * `OTHER` được loại khỏi tiến độ trung bình quản trị (BR-PRO-004) nên lựa chọn này là **thận
 * trọng**: bản ghi thiếu phân loại không làm sai KPI, và hiện rõ trong Data Health để BOC sửa.
 */
const FALLBACK_MANAGEMENT_LEVEL: ManagementLevelCode = 'DEPARTMENT';
const FALLBACK_CATEGORY: CategoryCode = 'OTHER';

async function main(): Promise<void> {
  const rawItems = readJson<SeedWorkItem[]>('work-items.json');
  const accounts = readJson<SeedAccount[]>('accounts.json');
  const holidays = readJson<SeedHoliday[]>('holidays.json');
  const unitNames = readJson<string[]>('units.json');

  const tables = Object.fromEntries(
    TABLE_NAMES.map((name) => [name, [] as Record<string, unknown>[]]),
  ) as unknown as Record<TableName, Record<string, unknown>[]>;

  // --- đơn vị ---------------------------------------------------------------
  const unitIdByName = new Map<string, string>();
  const orderedUnits = ['Công ty', ...unitNames.filter((n) => n !== 'Công ty')];
  orderedUnits.forEach((name, index) => {
    const meta = UNIT_CODES[name] ?? { code: `U${index}`, type: 'DEPARTMENT' as const };
    const id = stableId('unit', meta.code);
    unitIdByName.set(name, id);
    tables.organizational_units.push({
      id,
      code: meta.code,
      name,
      parent_id: name === 'Công ty' ? null : stableId('unit', 'CTY'),
      unit_type: meta.type,
      manager_user_id: null,
      capacity_hours_per_day: null,
      sort_order: index,
      is_active: true,
      created_at: NOW,
      updated_at: NOW,
    });
  });

  // --- L1 / L2 --------------------------------------------------------------
  const managementLevelIdByCode = new Map<string, string>();
  MANAGEMENT_LEVELS.forEach((level) => {
    const id = stableId('management_level', level.code);
    managementLevelIdByCode.set(level.code, id);
    tables.management_levels.push({
      id,
      code: level.code,
      name: level.label,
      sort_order: level.order,
      is_active: true,
      created_at: NOW,
      updated_at: NOW,
    });
  });

  const categoryIdByCode = new Map<string, string>();
  WORK_CATEGORIES.forEach((category) => {
    const id = stableId('category', category.code);
    categoryIdByCode.set(category.code, id);
    tables.work_categories.push({
      id,
      code: category.code,
      name: category.label,
      sort_order: category.order,
      is_active: true,
      // Theo Sheet: “Công việc khác” không tính vào tiến độ trung bình (ADR-009).
      exclude_from_progress_avg: category.code === 'OTHER',
      created_at: NOW,
      updated_at: NOW,
    });
  });

  // --- người dùng, vai trò, phạm vi ------------------------------------------
  const userIdByAlias = new Map<string, string>();
  const password = process.env.LOCAL_DEV_PASSWORD ?? 'boc@2026';

  for (const account of accounts) {
    const userId = stableId('user', account.employee_code);
    if (account.alias) userIdByAlias.set(account.alias, userId);

    tables.profiles.push({
      id: stableId('profile', account.employee_code),
      user_id: userId,
      employee_code: account.employee_code,
      full_name: account.full_name,
      display_alias: account.alias,
      email: account.email,
      primary_unit_id: unitIdByName.get(unitNameForCode(account.unit_code)) ?? null,
      job_title: account.job_title,
      avatar_color: account.avatar_color,
      status: 'ACTIVE',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      capacity_hours_per_day: account.capacity_hours_per_day,
      password_hash: hashPassword(password),
      last_seen_at: null,
      created_at: NOW,
      updated_at: NOW,
    });

    for (const role of account.roles) {
      tables.user_roles.push({
        id: stableId('user_role', `${account.employee_code}:${role}`),
        user_id: userId,
        role_code: role,
        unit_id: unitIdByName.get(unitNameForCode(account.unit_code)) ?? null,
        valid_from: null,
        valid_to: null,
        created_at: NOW,
        updated_at: NOW,
      });
    }

    tables.data_scopes.push({
      id: stableId('scope', account.employee_code),
      user_id: userId,
      scope_type: account.scope,
      unit_id:
        account.scope === 'UNIT'
          ? (unitIdByName.get(unitNameForCode(account.unit_code)) ?? null)
          : null,
      include_children: true,
      valid_to: null,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  // Quản lý đơn vị: gán manager theo tài khoản có scope UNIT.
  for (const account of accounts.filter((a) => a.scope === 'UNIT')) {
    const unitId = unitIdByName.get(unitNameForCode(account.unit_code));
    const unit = tables.organizational_units.find((u) => u.id === unitId);
    if (unit) unit.manager_user_id = stableId('user', account.employee_code);
  }

  // --- ngày nghỉ + cấu hình --------------------------------------------------
  for (const holiday of holidays) {
    tables.holidays.push({
      id: stableId('holiday', holiday.holiday_date),
      holiday_date: holiday.holiday_date,
      name: holiday.name,
      year: holiday.year,
      source_note: holiday.source_note,
      is_confirmed: holiday.is_confirmed,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  const systemUserId = stableId('user', 'BOC-900');

  tables.capacity_settings.push({
    id: stableId('capacity', 'SYSTEM'),
    scope_type: 'SYSTEM',
    scope_id: null,
    hours_per_day: 8,
    effective_from: '2026-01-01',
    effective_to: null,
    created_at: NOW,
    updated_at: NOW,
  });

  const settings: [string, unknown, string, string][] = [
    ['work_week_mask', 'MON_SAT', 'string', 'Lịch làm việc: MON_SAT loại Chủ nhật (NEED_CONFIRMATION B2)'],
    ['capacity_days_per_week', 5, 'number', 'Số ngày quy đổi giờ/tuần → giờ/ngày (NEED_CONFIRMATION B3)'],
    ['default_capacity_hours_per_day', 8, 'number', 'Công suất chuẩn theo Sheet nguồn'],
    ['near_capacity_threshold', 0.85, 'number', 'Ngưỡng cận tải — Sheet có cả 0.80 và 0.85 (NEED_CONFIRMATION B4)'],
    ['deadline_warning_business_days', 7, 'number', 'Ngưỡng cảnh báo sắp đến hạn, tính theo ngày làm việc'],
    ['progress_rollup_mode', 'average', 'string', 'Cách cuộn tiến độ cha: average đều như Sheet (ADR-008)'],
  ];

  for (const [key, value, type, description] of settings) {
    tables.system_settings.push({
      id: stableId('setting', key),
      key,
      value_json: JSON.stringify(value),
      value_type: type,
      description,
      updated_by: systemUserId,
      version: 1,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  // --- công việc -------------------------------------------------------------
  const itemIdByCode = new Map<string, string>();
  for (const raw of rawItems) itemIdByCode.set(raw.code, stableId('work_item', raw.code));

  const byCode = new Map(rawItems.map((r) => [r.code, r]));
  const workItems: WorkItem[] = [];

  for (const raw of rawItems) {
    const level = Number(raw.level.slice(1)) as WorkLevel;
    const id = itemIdByCode.get(raw.code)!;
    const parentId = raw.parentCode ? (itemIdByCode.get(raw.parentCode) ?? null) : null;

    const managementLevelCode =
      mapSheetValue(SHEET_MANAGEMENT_LEVEL_MAP, raw.management_level_label) ??
      FALLBACK_MANAGEMENT_LEVEL;
    const categoryCode =
      mapSheetValue(SHEET_CATEGORY_MAP, raw.category_label) ?? FALLBACK_CATEGORY;

    const status = mapSheetValue(SHEET_STATUS_MAP, raw.status_label) ?? 'NOT_SCHEDULED';
    const scheduleType = mapSheetValue(SHEET_SCHEDULE_TYPE_MAP, raw.schedule_label) ?? 'UNSCHEDULED';

    workItems.push({
      id,
      code: raw.code,
      legacy_code: raw.code,
      level,
      parent_id: parentId,
      root_id: itemIdByCode.get(rootCodeOf(raw, byCode))!,
      path: pathOf(raw, byCode),
      depth: computeDepth(level),
      year: raw.year ?? 2026,
      management_level_id: managementLevelIdByCode.get(managementLevelCode)!,
      category_id: categoryIdByCode.get(categoryCode)!,
      title: raw.title,
      description: null,
      expected_output: raw.expected_output,
      value_contribution: raw.value_contribution,
      owning_unit_id:
        (raw.unit_name ? unitIdByName.get(raw.unit_name) : null) ?? unitIdByName.get('Công ty')!,
      lead_user_id: raw.lead_alias ? (userIdByAlias.get(raw.lead_alias) ?? null) : null,
      primary_assignee_id: raw.assignee_alias
        ? (userIdByAlias.get(raw.assignee_alias) ?? null)
        : null,
      status,
      priority: (raw.priority as Priority | null) ?? null,
      schedule_type: scheduleType,
      recurrence_rule: mapSheetValue(SHEET_CYCLE_MAP, raw.cycle_label),
      review_date: raw.review_date,
      planned_start: raw.planned_start,
      planned_end: raw.planned_end,
      display_start: null,
      display_end: null,
      manual_progress: raw.manual_progress,
      effective_progress: null,
      estimated_hours_input: raw.estimated_hours_input,
      effective_estimated_hours: null,
      allocation_unit: mapSheetValue(SHEET_ALLOCATION_UNIT_MAP, raw.allocation_unit_label),
      allocation_hours: raw.allocation_hours,
      completed_at: raw.completed_at,
      result_link: raw.result_link,
      data_quality_status: 'VALID',
      data_quality_codes: [],
      is_leaf: true,
      is_archived: false,
      archived_at: null,
      cancel_reason: null,
      created_by: systemUserId,
      updated_by: systemUserId,
      created_at: NOW,
      updated_at: NOW,
      version: 1,
    });
  }

  // Tính lại toàn bộ derived bằng chính domain service — không lấy số của Sheet.
  const categoryCodeById = new Map(
    [...categoryIdByCode.entries()].map(([code, id]) => [id, code as CategoryCode]),
  );
  const { items: recalculated } = recalculateTree(workItems, {
    categoryCodeOf: (item) => categoryCodeById.get(item.category_id) ?? null,
    mode: 'average',
  });

  tables.work_items = recalculated as unknown as Record<string, unknown>[];

  // Phân công: người thực hiện chính.
  for (const item of recalculated) {
    if (!item.primary_assignee_id) continue;
    tables.work_assignments.push({
      id: stableId('assignment', `${item.code}:ASSIGNEE`),
      work_item_id: item.id,
      user_id: item.primary_assignee_id,
      assignment_role: 'ASSIGNEE',
      unit_id: item.owning_unit_id,
      allocation_percent: null,
      started_at: NOW,
      ended_at: null,
      assigned_by: systemUserId,
      is_active: true,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  await persist(tables);
  await syncAppwriteAuthUsers(accounts, password);

  const quality = recalculated.reduce(
    (acc, item) => {
      acc[item.data_quality_status] += 1;
      return acc;
    },
    { VALID: 0, INCOMPLETE: 0, INVALID: 0 },
  );

  console.log(`Đơn vị        : ${tables.organizational_units.length}`);
  console.log(`Người dùng    : ${tables.profiles.length}`);
  console.log(`Công việc     : ${tables.work_items.length}`);
  console.log(`Phân công     : ${tables.work_assignments.length}`);
  console.log(`Ngày nghỉ     : ${tables.holidays.length}`);
  console.log(
    `Chất lượng    : hợp lệ ${quality.VALID} · thiếu ${quality.INCOMPLETE} · sai ${quality.INVALID}`,
  );
  console.log(`\nMật khẩu demo : ${password}`);
  console.log('Tài khoản     :');
  for (const account of accounts) {
    console.log(`  ${account.email.padEnd(26)} ${account.roles.join(', ')}`);
  }
}

function unitNameForCode(code: string): string {
  const entry = Object.entries(UNIT_CODES).find(([, meta]) => meta.code === code);
  return entry?.[0] ?? 'Công ty';
}

function rootCodeOf(row: SeedWorkItem, byCode: Map<string, SeedWorkItem>): string {
  let cursor = row;
  const guard = new Set<string>();
  while (cursor.parentCode && !guard.has(cursor.code)) {
    guard.add(cursor.code);
    const parent = byCode.get(cursor.parentCode);
    if (!parent) break;
    cursor = parent;
  }
  return cursor.code;
}

function pathOf(row: SeedWorkItem, byCode: Map<string, SeedWorkItem>): string {
  const segments: string[] = [row.code];
  let cursor = row;
  const guard = new Set<string>([row.code]);
  while (cursor.parentCode && !guard.has(cursor.parentCode)) {
    guard.add(cursor.parentCode);
    const parent = byCode.get(cursor.parentCode);
    if (!parent) break;
    segments.unshift(parent.code);
    cursor = parent;
  }
  return `/${segments.join('/')}`;
}

/**
 * Tạo tài khoản trong Appwrite Auth.
 *
 * Với `DATA_DRIVER=appwrite`, đăng nhập đi qua Appwrite Auth chứ không đối chiếu hash trong
 * `profiles`. Không có bước này thì bảng `profiles` có dữ liệu nhưng **không ai đăng nhập được**.
 *
 * `userId` trùng với `profiles.user_id` để hai phía luôn khớp nhau.
 */
async function syncAppwriteAuthUsers(accounts: SeedAccount[], password: string): Promise<void> {
  if ((process.env.DATA_DRIVER ?? 'local') !== 'appwrite') return;

  const { installAppwriteDnsOverride } = await import('../src/server/appwrite/dns-override');
  installAppwriteDnsOverride();

  const { Client, Users } = await import('node-appwrite');
  const users = new Users(
    new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_SERVER_API_KEY!),
  );

  let createdCount = 0;
  let updatedCount = 0;

  for (const account of accounts) {
    const userId = stableId('user', account.employee_code);
    try {
      await users.get({ userId });
      // Đã có: đồng bộ lại tên và mật khẩu khởi tạo để lần seed nào cũng đăng nhập được.
      await users.updateName({ userId, name: account.full_name });
      await users.updatePassword({ userId, password });
      updatedCount += 1;
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error;
      await users.create({
        userId,
        email: account.email,
        password,
        name: account.full_name,
      });
      createdCount += 1;
    }
  }

  console.log(`Appwrite Auth : tạo mới ${createdCount} · cập nhật ${updatedCount}`);
}

async function persist(tables: Record<TableName, Record<string, unknown>[]>): Promise<void> {
  const driver = process.env.DATA_DRIVER ?? 'local';

  if (driver === 'local') {
    const { writeDatabaseSnapshot } = await import('../src/server/db/local-driver');
    writeDatabaseSnapshot(tables as never);
    console.log(`Đích          : kho JSON local (${process.env.LOCAL_DATA_FILE ?? '.data/boc.json'})\n`);
    return;
  }

  const { createAppwriteStore } = await import('../src/server/db/appwrite-driver');
  const store = createAppwriteStore();
  const endpoint = process.env.APPWRITE_ENDPOINT ?? '(chưa cấu hình)';
  console.log(`Đích          : Appwrite TablesDB — ${endpoint}\n`);

  const total = TABLE_NAMES.reduce((sum, table) => sum + tables[table].length, 0);
  let written = 0;

  for (const table of TABLE_NAMES) {
    const rows = tables[table];
    if (rows.length === 0) continue;

    // `upsert` để chạy lại nhiều lần không tạo bản trùng và không cần đọc trước.
    for (const row of rows) {
      await store.upsert(table, row as never);
      written += 1;
      if (written % 25 === 0 || written === total) {
        process.stdout.write(`\r  Đã ghi ${written}/${total} bản ghi…`);
      }
    }
  }

  process.stdout.write('\n\n');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
