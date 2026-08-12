/**
 * Khai báo schema — nguồn sự thật DUY NHẤT cho:
 * - `scripts/bootstrap-appwrite.ts` (tạo table/column/index trên Appwrite TablesDB)
 * - `scripts/verify-schema.ts` (kiểm tra drift trong CI)
 * - driver local (biết bảng nào tồn tại)
 * - tài liệu data dictionary
 *
 * Guideline mục 7. Không sửa schema trực tiếp trên Appwrite Console — sửa ở đây rồi chạy bootstrap.
 */

export type ColumnSpec =
  | { kind: 'varchar'; size: number; required?: boolean; array?: boolean; default?: string }
  | { kind: 'text'; required?: boolean }
  | { kind: 'integer'; required?: boolean; min?: number; max?: number; default?: number }
  | { kind: 'float'; required?: boolean; min?: number; max?: number; default?: number }
  | { kind: 'boolean'; required?: boolean; default?: boolean }
  /**
   * `businessDate: true` = cột này là **ngày nghiệp vụ** (`YYYY-MM-DD`), không phải mốc thời gian.
   *
   * Appwrite lưu mọi cột `datetime` dưới dạng ISO đầy đủ. Nếu không đánh dấu, giá trị đọc lên sẽ
   * là `2026-08-15T00:00:00.000+00:00` và toàn bộ rule ngày (quá hạn, số ngày làm việc còn lại,
   * lịch) hỏng âm thầm. Driver dựa vào cờ này để quy đổi hai chiều theo `APP_TIMEZONE`.
   */
  | { kind: 'datetime'; required?: boolean; businessDate?: boolean }
  | { kind: 'enum'; values: readonly string[]; required?: boolean; default?: string }
  | { kind: 'email'; required?: boolean }
  | { kind: 'url'; required?: boolean };

export interface IndexSpec {
  key: string;
  type: 'key' | 'unique' | 'fulltext';
  columns: string[];
}

export interface TableSpec {
  id: string;
  name: string;
  columns: Record<string, ColumnSpec>;
  indexes: IndexSpec[];
  /** Bảng append-only: không có API sửa/xóa (guideline 7.15). */
  appendOnly?: boolean;
}

const id36 = { kind: 'varchar', size: 36 } as const;
const id36Required = { kind: 'varchar', size: 36, required: true } as const;

export const WORK_STATUS_VALUES = [
  'NOT_SCHEDULED',
  'SCHEDULED',
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;

export const PRIORITY_VALUES = ['P1', 'P2', 'P3', 'P4'] as const;
export const SCHEDULE_TYPE_VALUES = ['UNSCHEDULED', 'DEADLINE', 'RECURRING', 'AD_HOC'] as const;
export const CYCLE_VALUES = ['WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const;
export const ALLOCATION_UNIT_VALUES = ['DAY', 'WEEK'] as const;
export const DATA_QUALITY_VALUES = ['VALID', 'INCOMPLETE', 'INVALID'] as const;
export const EXECUTION_STATUS_VALUES = ['NOT_DONE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'] as const;

export const TABLES = {
  profiles: {
    id: 'profiles',
    name: 'Hồ sơ người dùng',
    columns: {
      user_id: id36Required,
      employee_code: { kind: 'varchar', size: 50 },
      full_name: { kind: 'varchar', size: 200, required: true },
      display_alias: { kind: 'varchar', size: 100 },
      email: { kind: 'email', required: true },
      primary_unit_id: id36,
      job_title: { kind: 'varchar', size: 150 },
      avatar_color: { kind: 'varchar', size: 30 },
      status: { kind: 'enum', values: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], required: true },
      locale: { kind: 'varchar', size: 10, required: true },
      timezone: { kind: 'varchar', size: 50, required: true },
      capacity_hours_per_day: { kind: 'float' },
      password_hash: { kind: 'varchar', size: 255 },
      last_seen_at: { kind: 'datetime' },
    },
    indexes: [
      { key: 'idx_profiles_user', type: 'unique', columns: ['user_id'] },
      { key: 'idx_profiles_email', type: 'unique', columns: ['email'] },
      { key: 'idx_profiles_unit_status', type: 'key', columns: ['primary_unit_id', 'status'] },
    ],
  },

  user_roles: {
    id: 'user_roles',
    name: 'Vai trò người dùng',
    columns: {
      user_id: id36Required,
      role_code: { kind: 'varchar', size: 40, required: true },
      unit_id: id36,
      valid_from: { kind: 'datetime', businessDate: true },
      valid_to: { kind: 'datetime', businessDate: true },
    },
    indexes: [{ key: 'idx_user_roles_user', type: 'key', columns: ['user_id'] }],
  },

  data_scopes: {
    id: 'data_scopes',
    name: 'Phạm vi dữ liệu',
    columns: {
      user_id: id36Required,
      scope_type: {
        kind: 'enum',
        values: ['ALL', 'UNIT', 'SELF_ASSIGNED', 'CUSTOM'],
        required: true,
      },
      unit_id: id36,
      include_children: { kind: 'boolean', required: true, default: true },
      valid_to: { kind: 'datetime', businessDate: true },
    },
    indexes: [{ key: 'idx_data_scopes_user', type: 'key', columns: ['user_id'] }],
  },

  user_capabilities: {
    id: 'user_capabilities',
    name: 'Capability theo người dùng',
    columns: {
      user_id: id36Required,
      capability: { kind: 'varchar', size: 60, required: true },
      effect: { kind: 'enum', values: ['ALLOW', 'DENY'], required: true },
      reason: { kind: 'text' },
      expires_at: { kind: 'datetime', businessDate: true },
      granted_by: id36,
    },
    indexes: [
      { key: 'idx_user_caps', type: 'unique', columns: ['user_id', 'capability'] },
    ],
  },

  organizational_units: {
    id: 'organizational_units',
    name: 'Đơn vị',
    columns: {
      code: { kind: 'varchar', size: 30, required: true },
      name: { kind: 'varchar', size: 200, required: true },
      parent_id: id36,
      unit_type: {
        kind: 'enum',
        values: ['COMPANY', 'CENTER', 'DEPARTMENT', 'TEAM'],
        required: true,
      },
      manager_user_id: id36,
      capacity_hours_per_day: { kind: 'float' },
      sort_order: { kind: 'integer', required: true, default: 0 },
      is_active: { kind: 'boolean', required: true, default: true },
    },
    indexes: [{ key: 'idx_units_code', type: 'unique', columns: ['code'] }],
  },

  management_levels: {
    id: 'management_levels',
    name: 'Lớp 1 — Cấp quản trị',
    columns: {
      code: { kind: 'varchar', size: 30, required: true },
      name: { kind: 'varchar', size: 200, required: true },
      sort_order: { kind: 'integer', required: true, default: 0 },
      is_active: { kind: 'boolean', required: true, default: true },
    },
    indexes: [{ key: 'idx_ml_code', type: 'unique', columns: ['code'] }],
  },

  work_categories: {
    id: 'work_categories',
    name: 'Lớp 2 — Nhóm công việc',
    columns: {
      code: { kind: 'varchar', size: 30, required: true },
      name: { kind: 'varchar', size: 200, required: true },
      sort_order: { kind: 'integer', required: true, default: 0 },
      is_active: { kind: 'boolean', required: true, default: true },
      exclude_from_progress_avg: { kind: 'boolean', required: true, default: false },
    },
    indexes: [{ key: 'idx_cat_code', type: 'unique', columns: ['code'] }],
  },

  work_items: {
    id: 'work_items',
    name: 'Công việc L3–L6',
    columns: {
      code: { kind: 'varchar', size: 80, required: true },
      legacy_code: { kind: 'varchar', size: 80 },
      level: { kind: 'integer', required: true, min: 3, max: 6 },
      parent_id: id36,
      root_id: id36Required,
      path: { kind: 'varchar', size: 500, required: true },
      depth: { kind: 'integer', required: true, min: 0, max: 3 },
      year: { kind: 'integer', required: true },
      management_level_id: id36Required,
      category_id: id36Required,
      title: { kind: 'varchar', size: 500, required: true },
      description: { kind: 'text' },
      expected_output: { kind: 'text' },
      value_contribution: { kind: 'text' },
      owning_unit_id: id36Required,
      lead_user_id: id36,
      primary_assignee_id: id36,
      status: { kind: 'enum', values: WORK_STATUS_VALUES, required: true },
      priority: { kind: 'enum', values: PRIORITY_VALUES },
      schedule_type: { kind: 'enum', values: SCHEDULE_TYPE_VALUES, required: true },
      recurrence_rule: { kind: 'enum', values: CYCLE_VALUES },
      review_date: { kind: 'datetime', businessDate: true },
      planned_start: { kind: 'datetime', businessDate: true },
      planned_end: { kind: 'datetime', businessDate: true },
      display_start: { kind: 'datetime', businessDate: true },
      display_end: { kind: 'datetime', businessDate: true },
      manual_progress: { kind: 'float', min: 0, max: 100 },
      effective_progress: { kind: 'float', min: 0, max: 100 },
      estimated_hours_input: { kind: 'float', min: 0 },
      effective_estimated_hours: { kind: 'float', min: 0 },
      allocation_unit: { kind: 'enum', values: ALLOCATION_UNIT_VALUES },
      allocation_hours: { kind: 'float', min: 0 },
      completed_at: { kind: 'datetime', businessDate: true },
      result_link: { kind: 'varchar', size: 2000 },
      data_quality_status: { kind: 'enum', values: DATA_QUALITY_VALUES, required: true },
      data_quality_codes: { kind: 'varchar', size: 60, array: true },
      is_leaf: { kind: 'boolean', required: true, default: true },
      is_archived: { kind: 'boolean', required: true, default: false },
      archived_at: { kind: 'datetime' },
      cancel_reason: { kind: 'text' },
      created_by: id36Required,
      updated_by: id36Required,
      version: { kind: 'integer', required: true, default: 1 },
    },
    indexes: [
      { key: 'idx_wi_code', type: 'unique', columns: ['code'] },
      { key: 'idx_wi_parent', type: 'key', columns: ['parent_id'] },
      { key: 'idx_wi_root', type: 'key', columns: ['root_id'] },
      { key: 'idx_wi_year_state', type: 'key', columns: ['year', 'is_archived', 'status'] },
      { key: 'idx_wi_unit_due', type: 'key', columns: ['owning_unit_id', 'status', 'planned_end'] },
      {
        key: 'idx_wi_assignee_due',
        type: 'key',
        columns: ['primary_assignee_id', 'status', 'planned_end'],
      },
      { key: 'idx_wi_lead', type: 'key', columns: ['lead_user_id', 'status'] },
      {
        key: 'idx_wi_taxonomy',
        type: 'key',
        columns: ['management_level_id', 'category_id', 'year'],
      },
      { key: 'idx_wi_priority_due', type: 'key', columns: ['priority', 'status', 'planned_end'] },
      { key: 'idx_wi_schedule', type: 'key', columns: ['schedule_type', 'status'] },
      { key: 'idx_wi_quality', type: 'key', columns: ['data_quality_status', 'status'] },
      { key: 'idx_wi_title_ft', type: 'fulltext', columns: ['title'] },
    ],
  },

  work_assignments: {
    id: 'work_assignments',
    name: 'Phân công',
    columns: {
      work_item_id: id36Required,
      user_id: id36Required,
      assignment_role: {
        kind: 'enum',
        values: ['LEAD', 'OWNER', 'ASSIGNEE', 'COLLABORATOR', 'VIEWER'],
        required: true,
      },
      unit_id: id36,
      allocation_percent: { kind: 'float', min: 0, max: 100 },
      started_at: { kind: 'datetime' },
      ended_at: { kind: 'datetime' },
      assigned_by: id36Required,
      is_active: { kind: 'boolean', required: true, default: true },
    },
    indexes: [
      { key: 'idx_wa_item', type: 'key', columns: ['work_item_id', 'is_active'] },
      { key: 'idx_wa_user', type: 'key', columns: ['user_id', 'is_active'] },
    ],
  },

  work_dependencies: {
    id: 'work_dependencies',
    name: 'Phụ thuộc công việc',
    columns: {
      predecessor_id: id36Required,
      successor_id: id36Required,
      dependency_type: { kind: 'enum', values: ['FS', 'SS', 'FF', 'SF'], required: true },
      lag_days: { kind: 'integer', default: 0 },
      is_active: { kind: 'boolean', required: true, default: true },
    },
    indexes: [
      { key: 'idx_dep_pair', type: 'unique', columns: ['predecessor_id', 'successor_id'] },
    ],
  },

  execution_logs: {
    id: 'execution_logs',
    name: 'Nhật ký thực hiện',
    columns: {
      record_code: { kind: 'varchar', size: 80, required: true },
      work_item_id: id36Required,
      period_start: { kind: 'datetime', required: true, businessDate: true },
      period_end: { kind: 'datetime', businessDate: true },
      occurrence_due_at: { kind: 'datetime', businessDate: true },
      status: { kind: 'enum', values: EXECUTION_STATUS_VALUES, required: true },
      progress: { kind: 'float', min: 0, max: 100 },
      actual_hours: { kind: 'float', min: 0 },
      deadline_result: { kind: 'enum', values: ['ON_TIME', 'LATE', 'NO_DEADLINE'] },
      note: { kind: 'text' },
      skip_reason: { kind: 'text' },
      result_link: { kind: 'varchar', size: 2000 },
      responsible_user_id: id36Required,
      completed_at: { kind: 'datetime', businessDate: true },
      created_by: id36Required,
      updated_by: id36Required,
      version: { kind: 'integer', required: true, default: 1 },
    },
    indexes: [
      { key: 'idx_el_code', type: 'unique', columns: ['record_code'] },
      { key: 'idx_el_item_period', type: 'key', columns: ['work_item_id', 'period_start'] },
      {
        key: 'idx_el_owner',
        type: 'key',
        columns: ['responsible_user_id', 'period_start', 'status'],
      },
      { key: 'idx_el_due', type: 'key', columns: ['status', 'occurrence_due_at'] },
    ],
  },

  comments: {
    id: 'comments',
    name: 'Bình luận',
    columns: {
      entity_type: { kind: 'varchar', size: 40, required: true },
      entity_id: id36Required,
      parent_comment_id: id36,
      body: { kind: 'text', required: true },
      author_user_id: id36Required,
      mentioned_user_ids: { kind: 'varchar', size: 36, array: true },
      edited_at: { kind: 'datetime' },
      is_hidden: { kind: 'boolean', required: true, default: false },
      hidden_by: id36,
    },
    indexes: [{ key: 'idx_cm_entity', type: 'key', columns: ['entity_type', 'entity_id'] }],
  },

  attachments: {
    id: 'attachments',
    name: 'Tệp đính kèm',
    columns: {
      storage_file_id: id36,
      bucket_id: { kind: 'varchar', size: 60 },
      entity_type: { kind: 'varchar', size: 40, required: true },
      entity_id: id36Required,
      category: {
        kind: 'enum',
        values: ['INPUT', 'WORKING', 'RESULT', 'COMMENT'],
        required: true,
      },
      original_name: { kind: 'varchar', size: 255, required: true },
      mime_type: { kind: 'varchar', size: 120, required: true },
      size_bytes: { kind: 'integer', required: true, min: 0 },
      external_url: { kind: 'varchar', size: 2000 },
      version_no: { kind: 'integer', required: true, default: 1 },
      is_current: { kind: 'boolean', required: true, default: true },
      uploaded_by: id36Required,
      archived_at: { kind: 'datetime' },
    },
    indexes: [{ key: 'idx_at_entity', type: 'key', columns: ['entity_type', 'entity_id'] }],
  },

  notifications: {
    id: 'notifications',
    name: 'Thông báo',
    columns: {
      recipient_user_id: id36Required,
      type: { kind: 'varchar', size: 60, required: true },
      title: { kind: 'varchar', size: 300, required: true },
      body: { kind: 'text', required: true },
      entity_type: { kind: 'varchar', size: 40, required: true },
      entity_id: id36Required,
      dedupe_key: { kind: 'varchar', size: 255, required: true },
      priority: { kind: 'enum', values: ['HIGH', 'NORMAL', 'LOW'], required: true },
      read_at: { kind: 'datetime' },
    },
    indexes: [
      { key: 'idx_nt_recipient', type: 'key', columns: ['recipient_user_id', 'read_at'] },
      { key: 'idx_nt_dedupe', type: 'unique', columns: ['dedupe_key'] },
    ],
  },

  holidays: {
    id: 'holidays',
    name: 'Ngày nghỉ',
    columns: {
      holiday_date: { kind: 'datetime', required: true, businessDate: true },
      name: { kind: 'varchar', size: 200, required: true },
      year: { kind: 'integer', required: true },
      source_note: { kind: 'varchar', size: 300 },
      is_confirmed: { kind: 'boolean', required: true, default: false },
    },
    indexes: [{ key: 'idx_hd_date', type: 'unique', columns: ['holiday_date'] }],
  },

  capacity_settings: {
    id: 'capacity_settings',
    name: 'Công suất',
    columns: {
      scope_type: { kind: 'enum', values: ['SYSTEM', 'UNIT', 'USER'], required: true },
      scope_id: id36,
      hours_per_day: { kind: 'float', required: true, min: 0 },
      effective_from: { kind: 'datetime', required: true, businessDate: true },
      effective_to: { kind: 'datetime', businessDate: true },
    },
    indexes: [{ key: 'idx_cap_scope', type: 'key', columns: ['scope_type', 'scope_id'] }],
  },

  system_settings: {
    id: 'system_settings',
    name: 'Cấu hình hệ thống',
    columns: {
      key: { kind: 'varchar', size: 100, required: true },
      value_json: { kind: 'text', required: true },
      value_type: {
        kind: 'enum',
        values: ['string', 'number', 'boolean', 'json'],
        required: true,
      },
      description: { kind: 'varchar', size: 500, required: true },
      updated_by: id36Required,
      version: { kind: 'integer', required: true, default: 1 },
    },
    indexes: [{ key: 'idx_ss_key', type: 'unique', columns: ['key'] }],
  },

  audit_logs: {
    id: 'audit_logs',
    name: 'Audit log',
    appendOnly: true,
    columns: {
      event_id: { kind: 'varchar', size: 60, required: true },
      actor_user_id: id36Required,
      action: { kind: 'varchar', size: 80, required: true },
      entity_type: { kind: 'varchar', size: 40, required: true },
      entity_id: id36Required,
      request_id: { kind: 'varchar', size: 60 },
      before_json: { kind: 'text' },
      after_json: { kind: 'text' },
      changed_fields: { kind: 'varchar', size: 80, array: true },
      reason: { kind: 'text' },
    },
    indexes: [
      { key: 'idx_al_entity', type: 'key', columns: ['entity_type', 'entity_id'] },
      { key: 'idx_al_actor', type: 'key', columns: ['actor_user_id'] },
    ],
  },

  activity_events: {
    id: 'activity_events',
    name: 'Dòng hoạt động',
    appendOnly: true,
    columns: {
      entity_type: { kind: 'varchar', size: 40, required: true },
      entity_id: id36Required,
      actor_user_id: id36Required,
      verb: { kind: 'varchar', size: 60, required: true },
      summary: { kind: 'varchar', size: 500, required: true },
    },
    indexes: [{ key: 'idx_ae_entity', type: 'key', columns: ['entity_type', 'entity_id'] }],
  },

  outbox_events: {
    id: 'outbox_events',
    name: 'Outbox',
    columns: {
      event_type: { kind: 'varchar', size: 80, required: true },
      payload_json: { kind: 'text', required: true },
      status: {
        kind: 'enum',
        values: ['PENDING', 'PROCESSING', 'DONE', 'FAILED'],
        required: true,
      },
      attempt_count: { kind: 'integer', required: true, default: 0 },
      next_attempt_at: { kind: 'datetime' },
      processed_at: { kind: 'datetime' },
      last_error: { kind: 'text' },
    },
    indexes: [{ key: 'idx_ob_status', type: 'key', columns: ['status', 'next_attempt_at'] }],
  },

  import_jobs: {
    id: 'import_jobs',
    name: 'Phiên import',
    columns: {
      source_name: { kind: 'varchar', size: 255, required: true },
      source_checksum: { kind: 'varchar', size: 80 },
      mode: { kind: 'enum', values: ['DRY_RUN', 'PRODUCTION'], required: true },
      status: { kind: 'enum', values: ['RUNNING', 'SUCCEEDED', 'FAILED'], required: true },
      total_rows: { kind: 'integer', required: true, default: 0 },
      imported_rows: { kind: 'integer', required: true, default: 0 },
      error_rows: { kind: 'integer', required: true, default: 0 },
      mapping_version: { kind: 'varchar', size: 40, required: true },
      actor_user_id: id36Required,
      started_at: { kind: 'datetime', required: true },
      finished_at: { kind: 'datetime' },
    },
    indexes: [{ key: 'idx_ij_status', type: 'key', columns: ['status'] }],
  },

  import_errors: {
    id: 'import_errors',
    name: 'Lỗi import',
    appendOnly: true,
    columns: {
      job_id: id36Required,
      source_sheet: { kind: 'varchar', size: 100, required: true },
      source_row: { kind: 'integer', required: true },
      field: { kind: 'varchar', size: 100 },
      error_code: { kind: 'varchar', size: 60, required: true },
      message: { kind: 'varchar', size: 500, required: true },
      raw_value: { kind: 'varchar', size: 500 },
    },
    indexes: [{ key: 'idx_ie_job', type: 'key', columns: ['job_id'] }],
  },

  export_jobs: {
    id: 'export_jobs',
    name: 'Phiên export',
    columns: {
      report_type: { kind: 'varchar', size: 60, required: true },
      filters_json: { kind: 'text', required: true },
      format: { kind: 'enum', values: ['XLSX', 'CSV', 'PDF'], required: true },
      status: { kind: 'enum', values: ['RUNNING', 'SUCCEEDED', 'FAILED'], required: true },
      storage_file_id: id36,
      record_count: { kind: 'integer', required: true, default: 0 },
      checksum: { kind: 'varchar', size: 80 },
      actor_user_id: id36Required,
      // Mốc hết hạn của link tải — là thời điểm, không phải ngày nghiệp vụ.
      expires_at: { kind: 'datetime' },
    },
    indexes: [{ key: 'idx_ej_actor', type: 'key', columns: ['actor_user_id'] }],
  },
} as const satisfies Record<string, TableSpec>;

export type TableName = keyof typeof TABLES;

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/**
 * Giới hạn kích thước file do **server Appwrite** quyết định (`_APP_STORAGE_LIMIT`), không phải
 * do ứng dụng. Instance hiện tại của BOC đang đặt 30.000.000 byte, nên mọi bucket phải nằm dưới
 * mức đó; bootstrap sẽ tự hạ xuống và cảnh báo nếu server còn chặt hơn.
 *
 * 25 MB khớp đề xuất ở guideline 15.2 (NEED_CONFIRMATION E3).
 */
export const BUCKETS = [
  { id: 'boc_attachments', name: 'Tệp nghiệp vụ', maxFileSizeMb: 25 },
  { id: 'boc_imports', name: 'File import', maxFileSizeMb: 25 },
  { id: 'boc_exports', name: 'File export', maxFileSizeMb: 25 },
] as const;

export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const;
