/**
 * Kiểu dữ liệu nghiệp vụ dùng chung.
 *
 * Tầng này là TS thuần: không I/O, không `process.env`, không `new Date()`.
 * Guideline mục 7 (data model) và mục 3 (domain vocabulary).
 */

// ---------------------------------------------------------------------------
// Enum nghiệp vụ
// ---------------------------------------------------------------------------

/** L3 là gốc nghiệp vụ; các lớp con từ L4 trở đi không có giới hạn cứng. */
export type WorkLevel = number;

/** Guideline 3.4. `OVERDUE` là derived, không nằm ở đây. */
export type WorkStatus =
  | 'NOT_SCHEDULED'
  | 'SCHEDULED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

/** Guideline 3.5. */
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/** Guideline 3.3. */
export type ScheduleType = 'UNSCHEDULED' | 'DEADLINE' | 'RECURRING' | 'AD_HOC';

/** Chu kỳ của việc định kỳ — tương ứng cột “Chu kỳ” của Sheet. */
export type RecurrenceCycle = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

/** Đơn vị phân bổ giờ cam kết. */
export type AllocationUnit = 'DAY' | 'WEEK';

/** L2 — nhóm công việc BOC (guideline 7.6). */
export type CategoryCode = 'STRATEGIC' | 'SYSTEM_OPERATION' | 'GRAY_CROSS' | 'OTHER';

/** L1 — cấp quản trị (guideline 7.6). */
export type ManagementLevelCode = 'COMPANY' | 'DEPARTMENT';

export type DataQualityStatus = 'VALID' | 'INCOMPLETE' | 'INVALID';

/** Trạng thái một kỳ/lần thực hiện (guideline 7.10). */
export type ExecutionStatus = 'NOT_DONE' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export type DeadlineResult = 'ON_TIME' | 'LATE' | 'NO_DEADLINE';

/** Vai trò của một người trên một công việc (guideline 7.8). */
export type AssignmentRole = 'LEAD' | 'OWNER' | 'ASSIGNEE' | 'COLLABORATOR' | 'VIEWER';

export type RoleCode =
  | 'system_admin'
  | 'boc_director'
  | 'business_admin'
  | 'unit_manager'
  | 'member'
  | 'viewer'
  | 'auditor';

export type ScopeType = 'ALL' | 'UNIT' | 'SELF_ASSIGNED' | 'CUSTOM';

export type ProfileStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

/**
 * Ngày nghiệp vụ dạng `YYYY-MM-DD`, đã quy về `APP_TIMEZONE`.
 * Toàn bộ domain dùng kiểu này thay cho `Date` để tránh lệch timezone.
 */
export type BusinessDate = string;

/** Thời điểm ISO-8601 UTC. */
export type Instant = string;

// ---------------------------------------------------------------------------
// Bản ghi
// ---------------------------------------------------------------------------

export interface OrganizationalUnit {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  unit_type: 'CENTER' | 'DEPARTMENT' | 'TEAM' | 'COMPANY';
  manager_user_id: string | null;
  /** Công suất mặc định của đơn vị, ghi đè mặc định hệ thống (BR-LOD-006). */
  capacity_hours_per_day: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface Profile {
  id: string;
  user_id: string;
  employee_code: string | null;
  full_name: string;
  /** Tên hiển thị đúng như trong Sheet nguồn, phục vụ đối soát import. */
  display_alias: string | null;
  email: string;
  primary_unit_id: string | null;
  job_title: string | null;
  avatar_color: string | null;
  status: ProfileStatus;
  locale: string;
  timezone: string;
  capacity_hours_per_day: number | null;
  last_seen_at: Instant | null;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_code: RoleCode;
  unit_id: string | null;
  valid_from: BusinessDate | null;
  valid_to: BusinessDate | null;
}

export interface DataScope {
  id: string;
  user_id: string;
  scope_type: ScopeType;
  unit_id: string | null;
  include_children: boolean;
  valid_to: BusinessDate | null;
}

export interface UserCapabilityGrant {
  id: string;
  user_id: string;
  capability: string;
  effect: 'ALLOW' | 'DENY';
  reason: string | null;
  expires_at: BusinessDate | null;
  granted_by: string | null;
}

export interface ManagementLevel {
  id: string;
  code: ManagementLevelCode;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface WorkCategory {
  id: string;
  code: CategoryCode;
  name: string;
  sort_order: number;
  is_active: boolean;
  /** `OTHER` = true theo Sheet nguồn (guideline 7.6, ADR-009). */
  exclude_from_progress_avg: boolean;
}

/** Bảng cốt lõi — guideline 7.7. */
export interface WorkItem {
  id: string;
  code: string;
  /** Mã gốc trong Google Sheet, giữ để truy vết sau import. */
  legacy_code: string | null;
  level: WorkLevel;
  parent_id: string | null;
  root_id: string;
  /** Đường dẫn đầy đủ từ L3 tới node — server sinh, không nhận từ client. */
  path: string;
  depth: number;
  year: number;
  management_level_id: string;
  category_id: string;
  title: string;
  description: string | null;
  expected_output: string | null;
  value_contribution: string | null;
  owning_unit_id: string;
  lead_user_id: string | null;
  primary_assignee_id: string | null;
  status: WorkStatus;
  priority: Priority | null;
  schedule_type: ScheduleType;
  recurrence_rule: RecurrenceCycle | null;
  review_date: BusinessDate | null;
  planned_start: BusinessDate | null;
  planned_end: BusinessDate | null;

  // ----- derived / cache, chỉ server ghi (ADR-002) -----
  display_start: BusinessDate | null;
  display_end: BusinessDate | null;
  manual_progress: number | null;
  effective_progress: number | null;
  estimated_hours_input: number | null;
  effective_estimated_hours: number | null;
  is_leaf: boolean;
  data_quality_status: DataQualityStatus;
  data_quality_codes: string[];

  allocation_unit: AllocationUnit | null;
  allocation_hours: number | null;
  completed_at: BusinessDate | null;
  result_link: string | null;
  is_archived: boolean;
  archived_at: Instant | null;
  cancel_reason: string | null;
  created_by: string;
  updated_by: string;
  created_at: Instant;
  updated_at: Instant;
  version: number;
}

export interface WorkAssignment {
  id: string;
  work_item_id: string;
  user_id: string;
  assignment_role: AssignmentRole;
  unit_id: string | null;
  allocation_percent: number | null;
  started_at: Instant | null;
  ended_at: Instant | null;
  assigned_by: string;
  is_active: boolean;
}

/** Guideline 7.10 — một occurrence của việc định kỳ/phát sinh, hoặc check-in. */
export interface ExecutionLog {
  id: string;
  record_code: string;
  work_item_id: string;
  period_start: BusinessDate;
  period_end: BusinessDate | null;
  occurrence_due_at: BusinessDate | null;
  status: ExecutionStatus;
  progress: number | null;
  actual_hours: number | null;
  deadline_result: DeadlineResult | null;
  note: string | null;
  skip_reason: string | null;
  result_link: string | null;
  responsible_user_id: string;
  completed_at: BusinessDate | null;
  created_by: string;
  updated_by: string;
  created_at: Instant;
  updated_at: Instant;
  version: number;
}

export interface Comment {
  id: string;
  entity_type: 'work_item' | 'execution_log';
  entity_id: string;
  parent_comment_id: string | null;
  body: string;
  author_user_id: string;
  mentioned_user_ids: string[];
  edited_at: Instant | null;
  is_hidden: boolean;
  hidden_by: string | null;
  created_at: Instant;
}

export interface Attachment {
  id: string;
  storage_file_id: string | null;
  bucket_id: string | null;
  entity_type: 'work_item' | 'execution_log' | 'comment';
  entity_id: string;
  category: 'INPUT' | 'WORKING' | 'RESULT' | 'COMMENT';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  external_url: string | null;
  version_no: number;
  is_current: boolean;
  uploaded_by: string;
  created_at: Instant;
  archived_at: Instant | null;
}

export type NotificationType =
  | 'WORK_ASSIGNED'
  | 'WORK_UNASSIGNED'
  | 'COLLABORATOR_ADDED'
  | 'MENTIONED'
  | 'DEADLINE_NEAR'
  | 'OVERDUE'
  | 'P1_CHANGED'
  | 'CHILD_OUTSIDE_PARENT'
  | 'MISSING_DATA'
  | 'STATUS_CHANGED'
  | 'IMPORT_DONE'
  | 'EXPORT_DONE';

export interface AppNotification {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  /** `type|entity|recipient|window` — chặn trùng (guideline 6.8). */
  dedupe_key: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  read_at: Instant | null;
  created_at: Instant;
}

export interface Holiday {
  id: string;
  holiday_date: BusinessDate;
  name: string;
  year: number;
  source_note: string | null;
  /** false = ngày “tham chiếu” chưa được HR xác nhận (NEED_CONFIRMATION B7). */
  is_confirmed: boolean;
}

export interface CapacitySetting {
  id: string;
  scope_type: 'SYSTEM' | 'UNIT' | 'USER';
  scope_id: string | null;
  hours_per_day: number;
  effective_from: BusinessDate;
  effective_to: BusinessDate | null;
}

export interface SystemSetting {
  key: string;
  value_json: string;
  value_type: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  updated_by: string;
  updated_at: Instant;
  version: number;
}

export interface AuditLog {
  id: string;
  event_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  request_id: string | null;
  before_json: string | null;
  after_json: string | null;
  changed_fields: string[];
  reason: string | null;
  created_at: Instant;
}

export interface ActivityEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string;
  verb: string;
  summary: string;
  created_at: Instant;
}

export interface OutboxEvent {
  id: string;
  event_type: string;
  payload_json: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  attempt_count: number;
  next_attempt_at: Instant | null;
  processed_at: Instant | null;
  last_error: string | null;
  created_at: Instant;
}

export interface ImportJob {
  id: string;
  source_name: string;
  mode: 'DRY_RUN' | 'PRODUCTION';
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  total_rows: number;
  imported_rows: number;
  error_rows: number;
  mapping_version: string;
  actor_user_id: string;
  started_at: Instant;
  finished_at: Instant | null;
}

export interface ImportError {
  id: string;
  job_id: string;
  source_sheet: string;
  source_row: number;
  field: string | null;
  error_code: string;
  message: string;
  raw_value: string | null;
}
