/**
 * Danh mục nghiệp vụ + nhãn tiếng Việt + ánh xạ ngược từ giá trị Google Sheet.
 *
 * Đây là nơi DUY NHẤT dịch giữa mã kỹ thuật (`IN_PROGRESS`) và nhãn UI (“Đang thực hiện”).
 * Component không được tự viết chuỗi tiếng Việt cho trạng thái/ưu tiên.
 */

import type {
  AllocationUnit,
  AssignmentRole,
  CategoryCode,
  DataQualityStatus,
  ExecutionStatus,
  ManagementLevelCode,
  Priority,
  RecurrenceCycle,
  RoleCode,
  ScheduleType,
  WorkLevel,
  WorkStatus,
} from './types';

export interface CatalogEntry<T extends string> {
  code: T;
  label: string;
  /** Nhóm token màu trong `globals.css`, không phải mã hex. */
  tone: Tone;
  order: number;
}

export type Tone =
  | 'neutral'
  | 'info'
  | 'progress'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'strategic';

function index<T extends string>(entries: CatalogEntry<T>[]): Record<T, CatalogEntry<T>> {
  return Object.fromEntries(entries.map((e) => [e.code, e])) as Record<T, CatalogEntry<T>>;
}

// ---------------------------------------------------------------------------
// Trạng thái công việc — guideline 3.4
// ---------------------------------------------------------------------------

export const WORK_STATUSES: CatalogEntry<WorkStatus>[] = [
  { code: 'NOT_SCHEDULED', label: 'Chưa lên lịch', tone: 'muted', order: 1 },
  { code: 'SCHEDULED', label: 'Đã lên lịch', tone: 'info', order: 2 },
  { code: 'NOT_STARTED', label: 'Chưa bắt đầu', tone: 'neutral', order: 3 },
  { code: 'IN_PROGRESS', label: 'Đang thực hiện', tone: 'progress', order: 4 },
  { code: 'PAUSED', label: 'Tạm dừng', tone: 'warning', order: 5 },
  { code: 'COMPLETED', label: 'Hoàn thành', tone: 'success', order: 6 },
  { code: 'CANCELLED', label: 'Hủy', tone: 'danger', order: 7 },
];
export const WORK_STATUS_BY_CODE = index(WORK_STATUSES);

/** Trạng thái không còn “chạy”: loại khỏi KPI active, tải và mẫu số tiến độ. */
export const CLOSED_STATUSES: WorkStatus[] = ['COMPLETED', 'CANCELLED'];

/** Trạng thái chưa khởi động thật sự — Sheet loại khỏi tiến độ trung bình (ADR-009). */
export const PRE_EXECUTION_STATUSES: WorkStatus[] = ['NOT_SCHEDULED', 'SCHEDULED'];

// ---------------------------------------------------------------------------
// Ưu tiên — guideline 3.5
// ---------------------------------------------------------------------------

export const PRIORITIES: CatalogEntry<Priority>[] = [
  { code: 'P1', label: 'P1 · Trọng yếu', tone: 'danger', order: 1 },
  { code: 'P2', label: 'P2 · Quan trọng', tone: 'warning', order: 2 },
  { code: 'P3', label: 'P3 · Thông thường', tone: 'info', order: 3 },
  { code: 'P4', label: 'P4 · Thấp', tone: 'muted', order: 4 },
];
export const PRIORITY_BY_CODE = index(PRIORITIES);

// ---------------------------------------------------------------------------
// Loại lịch — guideline 3.3
// ---------------------------------------------------------------------------

export const SCHEDULE_TYPES: CatalogEntry<ScheduleType>[] = [
  { code: 'UNSCHEDULED', label: 'Chưa xếp lịch', tone: 'muted', order: 1 },
  { code: 'DEADLINE', label: 'Có thời hạn', tone: 'info', order: 2 },
  { code: 'RECURRING', label: 'Định kỳ', tone: 'progress', order: 3 },
  { code: 'AD_HOC', label: 'Khi phát sinh', tone: 'warning', order: 4 },
];
export const SCHEDULE_TYPE_BY_CODE = index(SCHEDULE_TYPES);

export const RECURRENCE_CYCLES: CatalogEntry<RecurrenceCycle>[] = [
  { code: 'WEEK', label: 'Tuần', tone: 'info', order: 1 },
  { code: 'MONTH', label: 'Tháng', tone: 'info', order: 2 },
  { code: 'QUARTER', label: 'Quý', tone: 'info', order: 3 },
  { code: 'YEAR', label: 'Năm', tone: 'info', order: 4 },
];
export const RECURRENCE_CYCLE_BY_CODE = index(RECURRENCE_CYCLES);

export const ALLOCATION_UNITS: CatalogEntry<AllocationUnit>[] = [
  { code: 'DAY', label: 'Ngày', tone: 'neutral', order: 1 },
  { code: 'WEEK', label: 'Tuần', tone: 'neutral', order: 2 },
];
export const ALLOCATION_UNIT_BY_CODE = index(ALLOCATION_UNITS);

// ---------------------------------------------------------------------------
// L1 / L2 — guideline 7.6
// ---------------------------------------------------------------------------

export const MANAGEMENT_LEVELS: CatalogEntry<ManagementLevelCode>[] = [
  { code: 'COMPANY', label: 'Cấp công ty', tone: 'strategic', order: 1 },
  { code: 'DEPARTMENT', label: 'Cấp phòng ban', tone: 'info', order: 2 },
];
export const MANAGEMENT_LEVEL_BY_CODE = index(MANAGEMENT_LEVELS);

export const WORK_CATEGORIES: CatalogEntry<CategoryCode>[] = [
  { code: 'STRATEGIC', label: 'Chiến lược/sống còn', tone: 'strategic', order: 1 },
  { code: 'SYSTEM_OPERATION', label: 'Hệ thống/Vận hành', tone: 'info', order: 2 },
  { code: 'GRAY_CROSS', label: 'Vùng xám/Giao cắt', tone: 'warning', order: 3 },
  { code: 'OTHER', label: 'Công việc khác', tone: 'muted', order: 4 },
];
export const WORK_CATEGORY_BY_CODE = index(WORK_CATEGORIES);

/** L2 bị loại khỏi tiến độ trung bình quản trị (BR-PRO-004). */
export const CATEGORIES_EXCLUDED_FROM_PROGRESS: CategoryCode[] = ['OTHER'];

// ---------------------------------------------------------------------------
// Cấp công việc
// ---------------------------------------------------------------------------

export const WORK_LEVELS: CatalogEntry<`${WorkLevel}`>[] = [
  { code: '3', label: 'Lớp 3 · Công việc chính', tone: 'strategic', order: 3 },
  { code: '4', label: 'Lớp 4 · Danh mục', tone: 'info', order: 4 },
  { code: '5', label: 'Lớp 5 · Nhiệm vụ', tone: 'progress', order: 5 },
  { code: '6', label: 'Lớp 6 · Tác nghiệp', tone: 'neutral', order: 6 },
];

export function levelLabel(level: WorkLevel): string {
  return `L${level}`;
}

export function levelLongLabel(level: WorkLevel): string {
  return WORK_LEVELS.find((l) => l.code === String(level))?.label ?? `Lớp ${level}`;
}

// ---------------------------------------------------------------------------
// Nhật ký thực hiện
// ---------------------------------------------------------------------------

export const EXECUTION_STATUSES: CatalogEntry<ExecutionStatus>[] = [
  { code: 'NOT_DONE', label: 'Chưa thực hiện', tone: 'muted', order: 1 },
  { code: 'IN_PROGRESS', label: 'Đang thực hiện', tone: 'progress', order: 2 },
  { code: 'COMPLETED', label: 'Hoàn thành', tone: 'success', order: 3 },
  { code: 'SKIPPED', label: 'Bỏ qua', tone: 'warning', order: 4 },
];
export const EXECUTION_STATUS_BY_CODE = index(EXECUTION_STATUSES);

// ---------------------------------------------------------------------------
// Chất lượng dữ liệu
// ---------------------------------------------------------------------------

export const DATA_QUALITY_STATUSES: CatalogEntry<DataQualityStatus>[] = [
  { code: 'VALID', label: 'Đủ dữ liệu', tone: 'success', order: 1 },
  { code: 'INCOMPLETE', label: 'Thiếu dữ liệu', tone: 'warning', order: 2 },
  { code: 'INVALID', label: 'Dữ liệu sai', tone: 'danger', order: 3 },
];
export const DATA_QUALITY_STATUS_BY_CODE = index(DATA_QUALITY_STATUSES);

// ---------------------------------------------------------------------------
// Vai trò & phân công
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<RoleCode, string> = {
  system_admin: 'Quản trị hệ thống',
  boc_director: 'Giám đốc BOC',
  business_admin: 'Quản trị nghiệp vụ',
  unit_manager: 'Quản lý đơn vị',
  member: 'Thành viên',
  viewer: 'Người xem',
  auditor: 'Kiểm soát',
};

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  LEAD: 'Người Lead',
  OWNER: 'Người sở hữu',
  ASSIGNEE: 'Người thực hiện',
  COLLABORATOR: 'Người phối hợp',
  VIEWER: 'Người theo dõi',
};

// ---------------------------------------------------------------------------
// Ánh xạ ngược từ Google Sheet (dùng cho import + đối soát)
// ---------------------------------------------------------------------------

/** Chuẩn hóa chuỗi tiếng Việt của Sheet: bỏ khoảng trắng thừa, NFC, lowercase. */
export function normalizeSheetValue(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function reverseMap<T extends string>(pairs: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(pairs).map(([k, v]) => [normalizeSheetValue(k), v]));
}

export const SHEET_STATUS_MAP = reverseMap<WorkStatus>({
  'Chưa lên lịch': 'NOT_SCHEDULED',
  'Đã lên lịch': 'SCHEDULED',
  'Chưa bắt đầu': 'NOT_STARTED',
  'Đang thực hiện': 'IN_PROGRESS',
  'Tạm dừng': 'PAUSED',
  'Hoàn thành': 'COMPLETED',
  Hủy: 'CANCELLED',
});

export const SHEET_SCHEDULE_TYPE_MAP = reverseMap<ScheduleType>({
  'Chưa xếp lịch': 'UNSCHEDULED',
  'Có thời hạn': 'DEADLINE',
  'Định kỳ': 'RECURRING',
  'Khi phát sinh': 'AD_HOC',
});

export const SHEET_CYCLE_MAP = reverseMap<RecurrenceCycle>({
  Tuần: 'WEEK',
  Tháng: 'MONTH',
  Quý: 'QUARTER',
  Năm: 'YEAR',
});

export const SHEET_ALLOCATION_UNIT_MAP = reverseMap<AllocationUnit>({
  Ngày: 'DAY',
  Tuần: 'WEEK',
});

export const SHEET_MANAGEMENT_LEVEL_MAP = reverseMap<ManagementLevelCode>({
  'Cấp công ty': 'COMPANY',
  'Cấp phòng ban': 'DEPARTMENT',
});

export const SHEET_CATEGORY_MAP = reverseMap<CategoryCode>({
  'Chiến lược/sống còn': 'STRATEGIC',
  'Hệ thống/Vận hành': 'SYSTEM_OPERATION',
  'Vùng xám/Giao cắt': 'GRAY_CROSS',
  'Công việc khác': 'OTHER',
});

export const SHEET_EXECUTION_STATUS_MAP = reverseMap<ExecutionStatus>({
  'Chưa thực hiện': 'NOT_DONE',
  'Đang thực hiện': 'IN_PROGRESS',
  'Hoàn thành': 'COMPLETED',
  'Bỏ qua': 'SKIPPED',
});

/** Trả về `null` (không đoán) nếu giá trị nguồn không nằm trong danh mục đã duyệt. */
export function mapSheetValue<T extends string>(
  map: Map<string, T>,
  raw: string | null | undefined,
): T | null {
  if (!raw) return null;
  return map.get(normalizeSheetValue(raw)) ?? null;
}
