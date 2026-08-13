import { z } from 'zod';

/**
 * Zod cho mọi input từ client (guideline mục 0.9 bước “validate Zod”).
 *
 * Lưu ý: schema **không** chứa `created_by`, `updated_by`, `root_id`, `path`, `depth`,
 * `effective_*`, `display_*`, `is_leaf`, `data_quality_*`, `version` — đó là giá trị server tự
 * sinh; nhận từ browser là vi phạm guideline mục 0.8.
 */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng yyyy-mm-dd')
  .nullable();

const optionalText = z.string().trim().max(4000).nullable();

/** Chỉ chấp nhận http/https — chặn `javascript:`/`data:` (guideline 16.1). */
const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .refine(
    (value) => !value || /^https?:\/\//i.test(value),
    'Link kết quả phải bắt đầu bằng http:// hoặc https://',
  );

export const workLevelSchema = z.number().int().min(3);

export const workStatusSchema = z.enum([
  'NOT_SCHEDULED',
  'SCHEDULED',
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

export const prioritySchema = z.enum(['P1', 'P2', 'P3', 'P4']);
export const scheduleTypeSchema = z.enum(['UNSCHEDULED', 'DEADLINE', 'RECURRING', 'AD_HOC']);
export const cycleSchema = z.enum(['WEEK', 'MONTH', 'QUARTER', 'YEAR']);
export const allocationUnitSchema = z.enum(['DAY', 'WEEK']);

export const createWorkItemSchema = z
  .object({
    level: workLevelSchema,
    parent_id: z.string().max(64).nullable(),
    year: z.number().int().min(2020).max(2100),
    management_level_id: z.string().min(1, 'Chọn Lớp 1 — cấp quản trị'),
    category_id: z.string().min(1, 'Chọn Lớp 2 — nhóm công việc'),
    title: z.string().trim().min(3, 'Tên công việc tối thiểu 3 ký tự').max(500),
    description: optionalText,
    expected_output: optionalText,
    value_contribution: optionalText,
    owning_unit_id: z.string().min(1, 'Chọn đơn vị phụ trách'),
    lead_user_id: z.string().max(64).nullable(),
    primary_assignee_id: z.string().max(64).nullable(),
    status: workStatusSchema,
    priority: prioritySchema.nullable(),
    schedule_type: scheduleTypeSchema,
    recurrence_rule: cycleSchema.nullable(),
    review_date: dateString,
    planned_start: dateString,
    planned_end: dateString,
    estimated_hours_input: z.number().min(0).max(100_000).nullable(),
    allocation_unit: allocationUnitSchema.nullable(),
    allocation_hours: z.number().min(0).max(1000).nullable(),
    result_link: safeUrl,
  })
  .refine((v) => v.level === 3 || Boolean(v.parent_id), {
    message: 'Công việc từ L4 trở đi bắt buộc chọn công việc cha',
    path: ['parent_id'],
  })
  .refine((v) => v.level !== 3 || !v.parent_id, {
    message: 'Công việc L3 không được có công việc cha',
    path: ['parent_id'],
  })
  .refine((v) => !(v.planned_start && v.planned_end) || v.planned_end >= v.planned_start, {
    message: 'Ngày kết thúc không được trước ngày bắt đầu',
    path: ['planned_end'],
  })
  .refine((v) => v.schedule_type !== 'RECURRING' || Boolean(v.recurrence_rule), {
    message: 'Việc định kỳ bắt buộc chọn chu kỳ',
    path: ['recurrence_rule'],
  })
  .refine((v) => v.status !== 'NOT_SCHEDULED' || (!v.planned_start && !v.planned_end), {
    message: 'Trạng thái “Chưa lên lịch” không được có ngày kế hoạch',
    path: ['status'],
  });

export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>;

export const updateWorkItemSchema = createWorkItemSchema.safeExtend({
  id: z.string().min(1),
  expected_version: z.number().int().min(1),
  reason: z.string().trim().max(500).nullable(),
});

export type UpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>;

/** Cập nhật nhanh ở My Work — chỉ những trường người thực hiện được đổi. */
export const quickUpdateSchema = z.object({
  id: z.string().min(1),
  expected_version: z.number().int().min(1),
  manual_progress: z.number().min(0).max(100).nullable(),
  status: workStatusSchema.optional(),
  note: z.string().trim().max(2000).nullable(),
  completed_at: dateString.optional(),
  result_link: safeUrl.optional(),
});

export type QuickUpdateInput = z.infer<typeof quickUpdateSchema>;

export const changeStatusSchema = z.object({
  id: z.string().min(1),
  expected_version: z.number().int().min(1),
  status: workStatusSchema,
  reason: z.string().trim().max(500).nullable(),
  completed_at: dateString.optional(),
  result_link: safeUrl.optional(),
});

export const executionLogSchema = z
  .object({
    work_item_id: z.string().min(1),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_end: dateString,
    occurrence_due_at: dateString,
    status: z.enum(['NOT_DONE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']),
    progress: z.number().min(0).max(100).nullable(),
    actual_hours: z.number().min(0).max(500).nullable(),
    note: optionalText,
    skip_reason: optionalText,
    result_link: safeUrl,
    responsible_user_id: z.string().min(1),
    completed_at: dateString,
  })
  .refine((v) => v.status !== 'SKIPPED' || Boolean(v.skip_reason?.trim()), {
    message: 'Bỏ qua một kỳ bắt buộc ghi lý do',
    path: ['skip_reason'],
  })
  .refine((v) => v.status !== 'COMPLETED' || Boolean(v.completed_at), {
    message: 'Hoàn thành kỳ bắt buộc có ngày thực tế',
    path: ['completed_at'],
  });

export type ExecutionLogInput = z.infer<typeof executionLogSchema>;

export const commentSchema = z.object({
  entity_type: z.enum(['work_item', 'execution_log']),
  entity_id: z.string().min(1),
  body: z.string().trim().min(1, 'Nội dung bình luận không được trống').max(4000),
  mentioned_user_ids: z.array(z.string().max(64)).max(20).default([]),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});
