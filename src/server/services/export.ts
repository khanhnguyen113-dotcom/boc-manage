import 'server-only';

import { randomUUID } from 'node:crypto';

import ExcelJS from 'exceljs';

import { formatDate } from '@/domain/business-days';
import {
  PRIORITY_BY_CODE,
  SCHEDULE_TYPE_BY_CODE,
  WORK_STATUS_BY_CODE,
} from '@/domain/catalogs';
import { DATA_QUALITY_LABELS, type DataQualityCode } from '@/domain/data-quality';
import { remainingHours } from '@/domain/progress';
import type { WorkItem } from '@/domain/types';

import type { SessionUser } from '../auth/current-user';
import { getStore } from '../db/store';
import { recordAudit } from './audit';
import type { BocContext } from './context';

/**
 * Export XLSX — guideline 11.4.
 *
 * Ba điều bắt buộc:
 * 1. Dùng **cùng service số liệu** với màn hình, không tính lại theo cách khác.
 * 2. Chống spreadsheet formula injection ở **một** hàm duy nhất.
 * 3. Mỗi lần export ghi audit: ai, báo cáo gì, bộ lọc nào, bao nhiêu dòng.
 */

/**
 * Ô bắt đầu bằng `=`, `+`, `-`, `@`, TAB hoặc CR có thể bị Excel/Sheets diễn giải thành công
 * thức khi mở file. Thêm dấu nháy đơn ở đầu để ép về text.
 */
export function sanitizeCell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
}

interface SheetColumn<T> {
  header: string;
  width: number;
  value: (row: T) => unknown;
}

const WORK_ITEM_COLUMNS: (ctx: BocContext) => SheetColumn<WorkItem>[] = (ctx) => [
  { header: 'Mã công việc', width: 20, value: (r) => r.code },
  { header: 'Mã gốc (Sheet)', width: 18, value: (r) => r.legacy_code },
  { header: 'Cấp', width: 6, value: (r) => `L${r.level}` },
  { header: 'Đường dẫn cây', width: 40, value: (r) => r.path },
  { header: 'Tên công việc', width: 48, value: (r) => r.title },
  { header: 'Kết quả đầu ra', width: 40, value: (r) => r.expected_output },
  { header: 'Giá trị mang lại', width: 30, value: (r) => r.value_contribution },
  { header: 'Năm', width: 8, value: (r) => r.year },
  { header: 'Lớp 1', width: 16, value: (r) => ctx.names.managementLevelName(r.management_level_id) },
  { header: 'Lớp 2', width: 20, value: (r) => ctx.names.categoryName(r.category_id) },
  { header: 'Đơn vị phụ trách', width: 22, value: (r) => ctx.names.unitName(r.owning_unit_id) },
  { header: 'Người Lead', width: 22, value: (r) => ctx.names.userName(r.lead_user_id) },
  { header: 'Người thực hiện', width: 22, value: (r) => ctx.names.userName(r.primary_assignee_id) },
  { header: 'Trạng thái', width: 16, value: (r) => WORK_STATUS_BY_CODE[r.status].label },
  { header: 'Ưu tiên', width: 10, value: (r) => (r.priority ? PRIORITY_BY_CODE[r.priority].code : null) },
  { header: 'Loại lịch', width: 16, value: (r) => SCHEDULE_TYPE_BY_CODE[r.schedule_type].label },
  { header: 'Tiến độ (%)', width: 12, value: (r) => r.effective_progress },
  { header: 'Điểm cuối', width: 10, value: (r) => (r.is_leaf ? 'Có' : 'Không') },
  { header: 'Bắt đầu (gốc)', width: 14, value: (r) => formatDate(r.planned_start) },
  { header: 'Kết thúc (gốc)', width: 14, value: (r) => formatDate(r.planned_end) },
  { header: 'Bắt đầu (hiển thị)', width: 16, value: (r) => formatDate(r.display_start) },
  { header: 'Kết thúc (hiển thị)', width: 16, value: (r) => formatDate(r.display_end) },
  { header: 'Khối lượng (giờ)', width: 14, value: (r) => r.effective_estimated_hours },
  { header: 'Giờ còn lại', width: 12, value: (r) => remainingHours(r) },
  { header: 'Đơn vị phân bổ', width: 14, value: (r) => (r.allocation_unit === 'DAY' ? 'Ngày' : r.allocation_unit === 'WEEK' ? 'Tuần' : null) },
  { header: 'Phân bổ (giờ/kỳ)', width: 14, value: (r) => r.allocation_hours },
  { header: 'Ngày HT thực tế', width: 14, value: (r) => formatDate(r.completed_at) },
  { header: 'Link kết quả', width: 40, value: (r) => r.result_link },
  { header: 'Chất lượng dữ liệu', width: 16, value: (r) => r.data_quality_status },
  {
    header: 'Vấn đề dữ liệu',
    width: 46,
    value: (r) =>
      r.data_quality_codes
        .map((code) => DATA_QUALITY_LABELS[code as DataQualityCode] ?? code)
        .join('; '),
  },
];

function addSheet<T>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: SheetColumn<T>[],
  rows: readonly T[],
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((column) => ({ header: column.header, width: column.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F3F6' },
  };

  for (const row of rows) {
    sheet.addRow(columns.map((column) => sanitizeCell(column.value(row))));
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  recordCount: number;
}

export async function exportWorkItems(
  user: SessionUser,
  items: readonly WorkItem[],
  ctx: BocContext,
  filters: Record<string, unknown>,
): Promise<ExportResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BOC Control Tower';
  workbook.created = new Date();

  // Sheet định nghĩa đứng trước: người nhận file biết ngay số liệu được lọc thế nào.
  const meta = workbook.addWorksheet('Filters & Definitions');
  meta.columns = [{ width: 34 }, { width: 70 }];
  const metaRows: [string, string][] = [
    ['Hệ thống', 'BOC Control Tower — Trung tâm Điều hành Công việc BOC'],
    ['Người xuất', `${user.profile.full_name} <${user.profile.email}>`],
    ['Thời điểm xuất', new Date().toISOString()],
    ['Ngày nghiệp vụ', ctx.today],
    ['Múi giờ', 'Asia/Ho_Chi_Minh'],
    ['Phạm vi dữ liệu', user.scope.all ? 'Toàn BOC' : `Giới hạn theo đơn vị/phân công của người xuất`],
    ['Bộ lọc áp dụng', JSON.stringify(filters)],
    ['Cách cuộn tiến độ', ctx.rollupMode === 'average' ? 'Trung bình đều các công việc con hợp lệ' : 'Trung bình có trọng số theo giờ'],
    ['Loại khỏi tiến độ TB', 'Nhóm “Công việc khác”, trạng thái Chưa lên lịch / Đã lên lịch / Hủy'],
    ['Lịch làm việc', `${ctx.calendar.mask[6] ? 'Thứ 2 – Thứ 7 (loại Chủ nhật)' : 'Thứ 2 – Thứ 6'}, trừ ngày nghỉ đã khai báo`],
    ['Quy đổi giờ/tuần', `Chia ${ctx.capacity.capacityDaysPerWeek} ngày`],
    ['Ngưỡng cận tải', `${Math.round(ctx.capacity.nearCapacityThreshold * 100)}%`],
    ['Ngưỡng sắp đến hạn', `${ctx.deadlineWarningDays} ngày làm việc`],
  ];
  for (const [label, value] of metaRows) {
    const row = meta.addRow([sanitizeCell(label), sanitizeCell(value)]);
    row.getCell(1).font = { bold: true };
  }

  addSheet(workbook, 'Work Items', WORK_ITEM_COLUMNS(ctx), items);

  const problems = items.filter((i) => i.data_quality_status !== 'VALID');
  addSheet(
    workbook,
    'Data Quality',
    [
      { header: 'Mã công việc', width: 20, value: (r: WorkItem) => r.code },
      { header: 'Tên công việc', width: 48, value: (r: WorkItem) => r.title },
      { header: 'Trạng thái dữ liệu', width: 16, value: (r: WorkItem) => r.data_quality_status },
      {
        header: 'Chi tiết',
        width: 60,
        value: (r: WorkItem) =>
          r.data_quality_codes
            .map((code) => DATA_QUALITY_LABELS[code as DataQualityCode] ?? code)
            .join('; '),
      },
      {
        header: 'Người chịu trách nhiệm',
        width: 24,
        value: (r: WorkItem) => ctx.names.userName(r.primary_assignee_id ?? r.lead_user_id),
      },
    ],
    problems,
  );

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filename = `BOC_CongViec_${ctx.today.replace(/-/g, '')}.xlsx`;

  await logExport(user, 'work_items', filters, items.length);

  return { buffer, filename, recordCount: items.length };
}

async function logExport(
  user: SessionUser,
  reportType: string,
  filters: Record<string, unknown>,
  recordCount: number,
): Promise<void> {
  const store = await getStore();
  const id = randomUUID();

  await store.insert('export_jobs', {
    id,
    report_type: reportType,
    filters_json: JSON.stringify(filters),
    format: 'XLSX',
    status: 'SUCCEEDED',
    storage_file_id: null,
    record_count: recordCount,
    checksum: null,
    actor_user_id: user.actor.user_id,
    expires_at: null,
  });

  await recordAudit({
    actorUserId: user.actor.user_id,
    action: 'export.download',
    entityType: 'export_job',
    entityId: id,
    after: { report_type: reportType, record_count: recordCount, filters },
    changedFields: [],
  });
}
