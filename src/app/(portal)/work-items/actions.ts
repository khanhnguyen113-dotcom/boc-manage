'use server';

import { redirect } from 'next/navigation';

import {
  changeStatusSchema,
  commentSchema,
  createWorkItemSchema,
  deleteWorkItemSchema,
  executionLogSchema,
  quickUpdateSchema,
  reviewCompletionSchema,
  submitCompletionSchema,
  updateWorkItemSchema,
} from '@/schemas/work-item';
import { requireUser } from '@/server/auth/current-user';
import { createComment } from '@/server/services/comments';
import { toActionResult } from '@/server/services/errors';

import type { FormState } from './form-state';
import { createExecutionLog } from '@/server/services/execution-logs';
import {
  archiveWorkItem,
  changeWorkItemStatus,
  createWorkItem,
  deleteWorkItemBranch,
  quickUpdateWorkItem,
  reviewWorkItemCompletion,
  submitWorkItemCompletion,
  updateWorkItem,
} from '@/server/services/work-items';

/**
 * Server action = biên giới tin cậy.
 *
 * Mọi action đều: `requireUser()` → Zod → service (service tự kiểm quyền + rule) → `ActionResult`.
 * Không action nào nhận `created_by`, `version` tính sẵn hay giá trị derived từ form.
 */

function optionalString(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const text = typeof value === 'string' ? value.trim().replace(',', '.') : '';
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function readWorkItemForm(formData: FormData) {
  return {
    level: Number(formData.get('level')),
    parent_id: optionalString(formData.get('parent_id')),
    year: Number(formData.get('year')),
    management_level_id: String(formData.get('management_level_id') ?? ''),
    category_id: String(formData.get('category_id') ?? ''),
    title: String(formData.get('title') ?? ''),
    description: optionalString(formData.get('description')),
    expected_output: optionalString(formData.get('expected_output')),
    value_contribution: optionalString(formData.get('value_contribution')),
    owning_unit_id: String(formData.get('owning_unit_id') ?? ''),
    lead_user_id: optionalString(formData.get('lead_user_id')),
    primary_assignee_id: optionalString(formData.get('primary_assignee_id')),
    status: String(formData.get('status') ?? 'NOT_SCHEDULED'),
    priority: optionalString(formData.get('priority')),
    schedule_type: String(formData.get('schedule_type') ?? 'UNSCHEDULED'),
    recurrence_rule: optionalString(formData.get('recurrence_rule')),
    review_date: optionalString(formData.get('review_date')),
    planned_start: optionalString(formData.get('planned_start')),
    planned_end: optionalString(formData.get('planned_end')),
    estimated_hours_input: optionalNumber(formData.get('estimated_hours_input')),
    allocation_unit: optionalString(formData.get('allocation_unit')),
    allocation_hours: optionalNumber(formData.get('allocation_hours')),
    result_link: optionalString(formData.get('result_link')),
  };
}

function zodToState(issues: { path: PropertyKey[]; message: string }[]): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: 'Dữ liệu nhập chưa hợp lệ. Kiểm tra các trường được đánh dấu.', fieldErrors };
}

export async function createWorkItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createWorkItemSchema.safeParse(readWorkItemForm(formData));
  if (!parsed.success) return zodToState(parsed.error.issues);

  let createdId: string;
  try {
    const created = await createWorkItem(user, parsed.data);
    createdId = created.id;
  } catch (error) {
    const result = toActionResult(error);
    return { error: result.message, details: result.details?.blockers as FormState['details'] };
  }

  redirect(`/work-items/${createdId}`);
}

export async function updateWorkItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = updateWorkItemSchema.safeParse({
    ...readWorkItemForm(formData),
    id: String(formData.get('id') ?? ''),
    expected_version: Number(formData.get('expected_version')),
    reason: optionalString(formData.get('reason')),
  });
  if (!parsed.success) return zodToState(parsed.error.issues);

  try {
    await updateWorkItem(user, parsed.data);
  } catch (error) {
    const result = toActionResult(error);
    return { error: result.message, details: result.details?.blockers as FormState['details'] };
  }

  redirect(`/work-items/${parsed.data.id}`);
}

export async function quickUpdateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = quickUpdateSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    expected_version: Number(formData.get('expected_version')),
    manual_progress: optionalNumber(formData.get('manual_progress')),
    status: optionalString(formData.get('status')) ?? undefined,
    note: optionalString(formData.get('note')),
    completed_at: optionalString(formData.get('completed_at')) ?? undefined,
    result_link: optionalString(formData.get('result_link')) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error.issues);

  try {
    await quickUpdateWorkItem(user, parsed.data);
    return { error: null };
  } catch (error) {
    const result = toActionResult(error);
    return { error: result.message, details: result.details?.blockers as FormState['details'] };
  }
}

export async function changeStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = changeStatusSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    expected_version: Number(formData.get('expected_version')),
    status: String(formData.get('status') ?? ''),
    reason: optionalString(formData.get('reason')),
    completed_at: optionalString(formData.get('completed_at')) ?? undefined,
    result_link: optionalString(formData.get('result_link')) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error.issues);

  try {
    await changeWorkItemStatus(user, parsed.data);
    return { error: null };
  } catch (error) {
    const result = toActionResult(error);
    return { error: result.message, details: result.details?.blockers as FormState['details'] };
  }
}

export async function submitCompletionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = submitCompletionSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    expected_version: Number(formData.get('expected_version')),
    completed_at: String(formData.get('completed_at') ?? ''),
    result_link: optionalString(formData.get('result_link')),
    note: optionalString(formData.get('note')),
  });
  if (!parsed.success) return zodToState(parsed.error.issues);
  try {
    await submitWorkItemCompletion(user, parsed.data);
    return { error: null, success: 'Đã gửi kết quả. Công việc đang chờ người phụ trách xác nhận.' };
  } catch (error) {
    const result = toActionResult(error);
    return { error: result.message, details: result.details?.blockers as FormState['details'] };
  }
}

export async function reviewCompletionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = reviewCompletionSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    expected_version: Number(formData.get('expected_version')),
    decision: String(formData.get('decision') ?? ''),
    note: optionalString(formData.get('note')),
  });
  if (!parsed.success) return zodToState(parsed.error.issues);
  try {
    await reviewWorkItemCompletion(user, parsed.data);
    return {
      error: null,
      success: parsed.data.decision === 'APPROVE' ? 'Đã xác nhận hoàn thành.' : 'Đã trả lại kết quả cho người thực hiện.',
    };
  } catch (error) {
    const result = toActionResult(error);
    return { error: result.message, details: result.details?.blockers as FormState['details'] };
  }
}

export async function deleteWorkItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = deleteWorkItemSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    expected_version: Number(formData.get('expected_version')),
    reason: String(formData.get('reason') ?? ''),
    confirmation: String(formData.get('confirmation') ?? ''),
  });
  if (!parsed.success) return zodToState(parsed.error.issues);
  try {
    await deleteWorkItemBranch(
      user,
      parsed.data.id,
      parsed.data.expected_version,
      parsed.data.reason,
    );
  } catch (error) {
    return { error: toActionResult(error).message };
  }
  redirect('/work-items?deleted=1');
}

export async function archiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await archiveWorkItem(
      user,
      String(formData.get('id') ?? ''),
      Number(formData.get('expected_version')),
      String(formData.get('reason') ?? ''),
    );
    return { error: null };
  } catch (error) {
    return { error: toActionResult(error).message };
  }
}

export async function createExecutionLogAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = executionLogSchema.safeParse({
    work_item_id: String(formData.get('work_item_id') ?? ''),
    period_start: String(formData.get('period_start') ?? ''),
    period_end: optionalString(formData.get('period_end')),
    occurrence_due_at: optionalString(formData.get('occurrence_due_at')),
    status: String(formData.get('status') ?? 'NOT_DONE'),
    progress: optionalNumber(formData.get('progress')),
    actual_hours: optionalNumber(formData.get('actual_hours')),
    note: optionalString(formData.get('note')),
    skip_reason: optionalString(formData.get('skip_reason')),
    result_link: optionalString(formData.get('result_link')),
    responsible_user_id: String(formData.get('responsible_user_id') ?? ''),
    completed_at: optionalString(formData.get('completed_at')),
  });
  if (!parsed.success) return zodToState(parsed.error.issues);

  try {
    await createExecutionLog(user, parsed.data);
    return { error: null };
  } catch (error) {
    return { error: toActionResult(error).message };
  }
}

export async function createCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = commentSchema.safeParse({
    entity_type: String(formData.get('entity_type') ?? 'work_item'),
    entity_id: String(formData.get('entity_id') ?? ''),
    body: String(formData.get('body') ?? ''),
    mentioned_user_ids: formData.getAll('mentioned_user_ids').map(String).filter(Boolean),
  });
  if (!parsed.success) return zodToState(parsed.error.issues);

  try {
    await createComment(user, parsed.data);
    return { error: null };
  } catch (error) {
    return { error: toActionResult(error).message };
  }
}
