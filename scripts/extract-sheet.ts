/**
 * Trích dữ liệu từ bản chụp Google Sheet nguồn sang `data/seed/*.json`.
 *
 * Guideline mục 12.3 bước 1–5: freeze/copy nguồn → snapshot + checksum → parse giá trị thật →
 * chuẩn hóa → map danh mục. **Không** import giá trị derived (guideline 12.4): tiến độ cha,
 * ngày hiển thị, tải quy đổi… đều được tính lại bằng domain service của webapp.
 *
 *   npm run extract:sheet
 *
 * Đầu vào : data/source/BOC_Form_QTCV_5LOP_Final.xlsx
 * Đầu ra  : data/seed/{work-items,units,people,holidays,settings}.json
 *           data/seed/extraction-report.json  ← mọi dòng bị loại và lý do
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'data/source/BOC_Form_QTCV_5LOP_Final.xlsx');
const SEED_DIR = resolve(ROOT, 'data/seed');

const MASTER_SHEET = 'Trung tâm nhập liệu';
const CATALOG_SHEET = 'Danh mục chọn';
const HOLIDAY_SHEET = 'Ngày nghỉ lễ';
/** Lớp 1/Lớp 2 được nhập tay trên tab này, không có trong bảng master. */
const L3_SHEET = 'Lớp 3 - Công việc chính';
const L3_COL = { code: 9, managementLevel: 11, category: 12 } as const;

/** Vùng dữ liệu master, khớp đúng vùng công thức `$B$67:$B$212` trong Sheet. */
const MASTER_FIRST_ROW = 67;
const MASTER_LAST_ROW = 212;

/** Cột của bảng master (1-based), theo hàng tiêu đề 63. */
const COL = {
  stt: 1,
  code: 2,
  level: 3,
  parentCode: 4,
  year: 5,
  title: 6,
  expectedOutput: 7,
  valueContribution: 8,
  unit: 9,
  lead: 10,
  assignee: 11,
  status: 12,
  priority: 13,
  progress: 14,
  scheduleType: 15,
  cycle: 16,
  plannedEnd: 17,
  plannedStart: 18,
  reviewDate: 19,
  estimatedHoursInput: 20,
  estimatedHoursAdmin: 21,
  allocationUnit: 22,
  allocationHours: 23,
  completedAt: 24,
  resultLink: 25,
  hasChildren: 26,
} as const;

type Cell = string | number | null;

interface RawRow {
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
  /** 0–100, chỉ lấy khi là giá trị nhập tay ở điểm cuối. */
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
  /** Điền ở bước `applyTaxonomy`, kế thừa từ công việc L3 gốc. */
  management_level_label: string | null;
  category_label: string | null;
}

interface Taxonomy {
  management_level_label: string | null;
  category_label: string | null;
}

interface ExtractionIssue {
  source_sheet: string;
  source_row: number;
  code: string | null;
  field: string | null;
  error_code: string;
  message: string;
  raw_value: string | null;
}

const issues: ExtractionIssue[] = [];

function issue(partial: Omit<ExtractionIssue, 'source_sheet'>): void {
  issues.push({ source_sheet: MASTER_SHEET, ...partial });
}

// ---------------------------------------------------------------------------
// Đọc ô: phân biệt giá trị thật, công thức chưa có kết quả và lỗi #REF!
// ---------------------------------------------------------------------------

const FORMULA = Symbol('formula-without-result');

function readCell(row: ExcelJS.Row, col: number): Cell | typeof FORMULA {
  const value = row.getCell(col).value;
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return toIsoDate(value);

  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if ('error' in obj) return String(obj.error); // #REF!, #N/A…
    if ('richText' in obj) {
      return (obj.richText as { text: string }[]).map((t) => t.text).join('');
    }
    if ('text' in obj) return String(obj.text);
    if ('result' in obj) {
      const r = obj.result;
      if (r === null || r === undefined) return FORMULA;
      if (r instanceof Date) return toIsoDate(r);
      if (typeof r === 'object' && r !== null && 'error' in (r as object)) {
        return String((r as { error: unknown }).error);
      }
      return r as Cell;
    }
    if ('sharedFormula' in obj || 'formula' in obj) return FORMULA;
    return null;
  }

  return value as Cell;
}

function toIsoDate(d: Date): string {
  // Sheet nguồn đặt timezone America/Los_Angeles; giá trị ngày trong xlsx là ngày “trần”
  // nên lấy phần UTC là chính xác, không dịch múi giờ (guideline 8.4 BR-DAT-007).
  return d.toISOString().slice(0, 10);
}

function text(row: ExcelJS.Row, col: number): string | null {
  const v = readCell(row, col);
  if (v === FORMULA || v === null) return null;
  const s = String(v).normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.startsWith('#')) return null; // #REF!, #N/A — ghi nhận riêng
  return s;
}

function rawText(row: ExcelJS.Row, col: number): string | null {
  const v = readCell(row, col);
  if (v === FORMULA || v === null) return null;
  return String(v);
}

function num(row: ExcelJS.Row, col: number): number | null {
  const v = readCell(row, col);
  if (v === FORMULA || v === null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
}

function date(row: ExcelJS.Row, col: number): string | null {
  const v = readCell(row, col);
  if (v === FORMULA || v === null) return null;
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }
  if (typeof v === 'number') {
    // Serial ngày của Excel, epoch 1899-12-30.
    const ms = Math.round((v - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse bảng master
// ---------------------------------------------------------------------------

function parseMaster(ws: ExcelJS.Worksheet): RawRow[] {
  const rows: RawRow[] = [];

  for (let r = MASTER_FIRST_ROW; r <= MASTER_LAST_ROW; r++) {
    const row = ws.getRow(r);
    const code = text(row, COL.code);
    if (!code || !/^HH/i.test(code)) continue;

    const level = text(row, COL.level);
    if (!level || !/^L[3-6]$/i.test(level)) {
      issue({
        source_row: r,
        code,
        field: 'Cấp',
        error_code: 'INVALID_LEVEL',
        message: `Cấp công việc không hợp lệ: “${level ?? ''}”.`,
        raw_value: level,
      });
      continue;
    }

    const rawRefCells = [COL.code, COL.parentCode, COL.status, COL.priority].map((c) =>
      rawText(row, c),
    );
    if (rawRefCells.some((v) => v?.startsWith('#'))) {
      issue({
        source_row: r,
        code,
        field: null,
        error_code: 'SOURCE_FORMULA_ERROR',
        message: 'Dòng chứa lỗi công thức (#REF!/#N/A) ở cột khóa — không import.',
        raw_value: rawRefCells.join(' | '),
      });
      continue;
    }

    const hasChildren = (text(row, COL.hasChildren) ?? '').toLowerCase() === 'có';

    // Guideline 12.4: KHÔNG import giá trị derived. Ở node cha, cột “Phần trăm hoàn thành”
    // là công thức AVERAGEIFS ⇒ bỏ, để webapp cuộn lại từ con.
    const progressFraction = hasChildren ? null : num(row, COL.progress);

    rows.push({
      sourceRow: r,
      code,
      level: level.toUpperCase(),
      parentCode: text(row, COL.parentCode),
      year: num(row, COL.year),
      title: text(row, COL.title) ?? '',
      expected_output: text(row, COL.expectedOutput),
      value_contribution: text(row, COL.valueContribution),
      unit_name: text(row, COL.unit),
      lead_alias: text(row, COL.lead),
      assignee_alias: text(row, COL.assignee),
      status_label: text(row, COL.status),
      priority: text(row, COL.priority),
      manual_progress:
        progressFraction === null ? null : Math.round(progressFraction * 100 * 10) / 10,
      schedule_label: text(row, COL.scheduleType),
      cycle_label: text(row, COL.cycle),
      planned_start: date(row, COL.plannedStart),
      planned_end: date(row, COL.plannedEnd),
      review_date: date(row, COL.reviewDate),
      estimated_hours_input: num(row, COL.estimatedHoursInput),
      allocation_unit_label: text(row, COL.allocationUnit),
      allocation_hours: num(row, COL.allocationHours),
      completed_at: date(row, COL.completedAt),
      result_link: text(row, COL.resultLink),
      has_children_source: hasChildren,
      management_level_label: null,
      category_label: null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Kiểm tra quan hệ cha–con trước khi ghi seed
// ---------------------------------------------------------------------------

const LEVEL_NUM: Record<string, number> = { L3: 3, L4: 4, L5: 5, L6: 6 };

function resolveHierarchy(rows: RawRow[]): RawRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const accepted: RawRow[] = [];
  const rejected = new Set<string>();

  for (const row of rows) {
    const level = LEVEL_NUM[row.level];

    if (level === 3) {
      if (row.parentCode) {
        issue({
          source_row: row.sourceRow,
          code: row.code,
          field: 'Mã cha',
          error_code: 'L3_HAS_PARENT',
          message: 'Công việc L3 không được có mã cha.',
          raw_value: row.parentCode,
        });
      }
      accepted.push(row);
      continue;
    }

    if (!row.parentCode) {
      issue({
        source_row: row.sourceRow,
        code: row.code,
        field: 'Mã cha',
        error_code: 'MISSING_PARENT',
        message: `Công việc ${row.level} thiếu mã cha.`,
        raw_value: null,
      });
      rejected.add(row.code);
      continue;
    }

    const parent = byCode.get(row.parentCode);
    if (!parent) {
      // Guideline 12.4: orphan là LỖI, không tạo cha giả.
      issue({
        source_row: row.sourceRow,
        code: row.code,
        field: 'Mã cha',
        error_code: 'ORPHAN_REFERENCE',
        message: `Không tìm thấy công việc cha “${row.parentCode}” trong bảng master.`,
        raw_value: row.parentCode,
      });
      rejected.add(row.code);
      continue;
    }

    if (LEVEL_NUM[parent.level] !== level - 1) {
      issue({
        source_row: row.sourceRow,
        code: row.code,
        field: 'Mã cha',
        error_code: 'INVALID_PARENT_LEVEL',
        message: `Công việc ${row.level} có cha ${parent.level} (${parent.code}), phải là L${level - 1}.`,
        raw_value: row.parentCode,
      });
      rejected.add(row.code);
      continue;
    }

    accepted.push(row);
  }

  // Loại tiếp hậu duệ của những dòng đã bị loại, tránh tạo orphan tầng hai.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = accepted.length - 1; i >= 0; i--) {
      const row = accepted[i];
      if (row.parentCode && rejected.has(row.parentCode)) {
        issue({
          source_row: row.sourceRow,
          code: row.code,
          field: 'Mã cha',
          error_code: 'PARENT_REJECTED',
          message: `Công việc cha “${row.parentCode}” đã bị loại nên nhánh này cũng bị loại.`,
          raw_value: row.parentCode,
        });
        rejected.add(row.code);
        accepted.splice(i, 1);
        changed = true;
      }
    }
  }

  return accepted;
}

/**
 * Gán Lớp 1/Lớp 2: L3 lấy từ tab “Lớp 3”, L4–L6 kế thừa từ tổ tiên L3 (BR-HIE-003).
 * Thiếu phân loại là lỗi dữ liệu chứ không phải mặc định im lặng.
 */
function applyTaxonomy(rows: RawRow[], taxonomy: Map<string, Taxonomy>): void {
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const resolve = (row: RawRow, seen = new Set<string>()): Taxonomy => {
    if (row.management_level_label || row.category_label) {
      return {
        management_level_label: row.management_level_label,
        category_label: row.category_label,
      };
    }
    if (LEVEL_NUM[row.level] === 3) return taxonomy.get(row.code) ?? { management_level_label: null, category_label: null };
    if (!row.parentCode || seen.has(row.code)) {
      return { management_level_label: null, category_label: null };
    }
    seen.add(row.code);
    const parent = byCode.get(row.parentCode);
    return parent ? resolve(parent, seen) : { management_level_label: null, category_label: null };
  };

  for (const row of rows) {
    const result = resolve(row);
    row.management_level_label = result.management_level_label;
    row.category_label = result.category_label;

    if (!row.management_level_label || !row.category_label) {
      issue({
        source_row: row.sourceRow,
        code: row.code,
        field: 'Lớp 1 / Lớp 2',
        error_code: 'MISSING_TAXONOMY',
        message:
          'Không xác định được Lớp 1 (cấp quản trị) hoặc Lớp 2 (nhóm công việc) từ tab “Lớp 3”.',
        raw_value: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Danh mục
// ---------------------------------------------------------------------------

/**
 * Lớp 1/Lớp 2 của từng công việc L3. Các cấp dưới kế thừa qua `parentCode` (BR-HIE-003) nên
 * chỉ cần map ở gốc.
 */
function parseTaxonomy(ws: ExcelJS.Worksheet): Map<string, Taxonomy> {
  const map = new Map<string, Taxonomy>();
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = text(row, L3_COL.code);
    if (!code || !/^HHL3/i.test(code)) continue;
    map.set(code, {
      management_level_label: text(row, L3_COL.managementLevel),
      category_label: text(row, L3_COL.category),
    });
  }
  return map;
}

function parseCatalogColumn(ws: ExcelJS.Worksheet, col: number, firstRow = 2): string[] {
  const out: string[] = [];
  for (let r = firstRow; r <= ws.rowCount; r++) {
    const v = text(ws.getRow(r), col);
    if (v) out.push(v);
  }
  return out;
}

function parseHolidays(ws: ExcelJS.Worksheet) {
  const out: {
    holiday_date: string;
    name: string;
    year: number;
    source_note: string | null;
    is_confirmed: boolean;
  }[] = [];

  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const d = date(row, 1);
    if (!d) continue;
    const note = text(row, 4);
    out.push({
      holiday_date: d,
      name: text(row, 2) ?? 'Ngày nghỉ',
      year: num(row, 3) ?? Number(d.slice(0, 4)),
      source_note: note,
      // “BOC/HR xác nhận” = ngày tham chiếu, CHƯA được duyệt (NEED_CONFIRMATION B7).
      is_confirmed: note !== 'BOC/HR xác nhận',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const checksum = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE);

  const master = wb.getWorksheet(MASTER_SHEET);
  const catalog = wb.getWorksheet(CATALOG_SHEET);
  const holidaysSheet = wb.getWorksheet(HOLIDAY_SHEET);
  const l3Sheet = wb.getWorksheet(L3_SHEET);
  if (!master || !catalog || !holidaysSheet || !l3Sheet) {
    throw new Error('Thiếu sheet bắt buộc trong file nguồn.');
  }

  const rawRows = parseMaster(master);
  const rows = resolveHierarchy(rawRows);
  applyTaxonomy(rows, parseTaxonomy(l3Sheet));

  const units = parseCatalogColumn(catalog, 6);
  const people = parseCatalogColumn(catalog, 16);
  const holidays = parseHolidays(holidaysSheet);

  const capacityHoursPerDay = num(catalog.getRow(2), 10) ?? 8;
  const nearCapacityThreshold = num(catalog.getRow(3), 10) ?? 0.8;

  mkdirSync(SEED_DIR, { recursive: true });

  const byLevel = (n: number) => rows.filter((r) => LEVEL_NUM[r.level] === n).length;

  const report = {
    generated_at: new Date().toISOString(),
    source_file: 'data/source/BOC_Form_QTCV_5LOP_Final.xlsx',
    source_sha256: checksum,
    source_range: `${MASTER_SHEET}!B${MASTER_FIRST_ROW}:Z${MASTER_LAST_ROW}`,
    totals: {
      rows_found: rawRows.length,
      rows_accepted: rows.length,
      rows_rejected: rawRows.length - rows.length,
      by_level: { L3: byLevel(3), L4: byLevel(4), L5: byLevel(5), L6: byLevel(6) },
    },
    issues,
  };

  write('work-items.json', rows);
  write('units.json', units);
  write('people.json', people);
  write('holidays.json', holidays);
  write('settings.json', {
    capacity_hours_per_day: capacityHoursPerDay,
    near_capacity_threshold_source: nearCapacityThreshold,
    note:
      'near_capacity_threshold trong danh mục là 0.8 nhưng các sheet báo cáo dùng 0.85 — ' +
      'mâu thuẫn đã ghi ở NEED_CONFIRMATION B4. Giá trị áp dụng lấy từ system_settings.',
  });
  write('extraction-report.json', report);

  console.log(`Nguồn      : ${report.source_file}`);
  console.log(`SHA-256    : ${checksum}`);
  console.log(`Dòng đọc   : ${report.totals.rows_found}`);
  console.log(
    `Chấp nhận  : ${report.totals.rows_accepted} ` +
      `(L3=${byLevel(3)}, L4=${byLevel(4)}, L5=${byLevel(5)}, L6=${byLevel(6)})`,
  );
  console.log(`Bị loại    : ${report.totals.rows_rejected}`);
  console.log(`Đơn vị     : ${units.length} · Người: ${people.length} · Ngày nghỉ: ${holidays.length}`);

  if (issues.length > 0) {
    console.log(`\n${issues.length} vấn đề dữ liệu — chi tiết ở data/seed/extraction-report.json:`);
    const grouped = new Map<string, number>();
    for (const i of issues) grouped.set(i.error_code, (grouped.get(i.error_code) ?? 0) + 1);
    for (const [code, count] of grouped) console.log(`  ${code}: ${count}`);
  }
}

function write(name: string, data: unknown): void {
  writeFileSync(resolve(SEED_DIR, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
