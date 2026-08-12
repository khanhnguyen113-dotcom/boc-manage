import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { evaluateOccurrenceDeadline, periodKey } from '@/domain/execution';
import { hasCapability, relationTo } from '@/domain/permissions';
import type { ExecutionLog, WorkItem } from '@/domain/types';

import type { SessionUser } from '../auth/current-user';
import { env } from '@/config/env';
import { getStore, type Row } from '../db/store';
import { getExecutionLog, listExecutionLogs } from '../repositories/collaboration';
import { getWorkItem, listAssignments } from '../repositories/work-items';
import { diffFields, recordActivity, recordAudit } from './audit';
import { getBocContext } from './context';
import { businessRule, conflict, forbidden, notFound, validation } from './errors';

/**
 * Nhật ký thực hiện — guideline 6.4 và BR-REC-001…005.
 *
 * Đây là nguồn duy nhất của số liệu định kỳ/phát sinh trong báo cáo: giờ thực tế, số kỳ hoàn
 * thành, đúng hạn theo kỳ. Không bao giờ suy ra từ trạng thái công việc cha.
 */

export interface ExecutionLogPayload {
  work_item_id: string;
  period_start: string;
  period_end: string | null;
  occurrence_due_at: string | null;
  status: ExecutionLog['status'];
  progress: number | null;
  actual_hours: number | null;
  note: string | null;
  skip_reason: string | null;
  result_link: string | null;
  responsible_user_id: string;
  completed_at: string | null;
}

async function assertCanLog(user: SessionUser, item: WorkItem): Promise<void> {
  if (!hasCapability(user.actor, 'execution_log.create')) throw forbidden();

  if (user.scope.all || user.scope.unit_ids.has(item.owning_unit_id)) return;

  const collaborators = (await listAssignments(item.id)).map((a) => a.user_id);
  const relation = relationTo(item, user.actor.user_id, collaborators);
  if (
    !relation.is_assignee &&
    !relation.is_lead &&
    !relation.is_collaborator &&
    !relation.is_creator
  ) {
    throw forbidden('Bạn không tham gia công việc này.');
  }
}

/** Mã bản ghi giữ tinh thần Sheet (`yyyymm-CAP-MÃ-nnn`) nhưng sinh phía server. */
async function generateRecordCode(item: WorkItem, periodStart: string): Promise<string> {
  const store = await getStore();
  const existing = await store.all<Row & ExecutionLog>('execution_logs', {
    filters: [{ field: 'work_item_id', op: 'eq', value: item.id }],
  });
  const seq = String(existing.length + 1).padStart(3, '0');
  return `${periodStart.slice(0, 7).replace('-', '')}-L${item.level}-${item.code}-${seq}`;
}

export async function createExecutionLog(
  user: SessionUser,
  payload: ExecutionLogPayload,
): Promise<ExecutionLog> {
  const item = await getWorkItem(payload.work_item_id);
  if (!item) throw notFound('Không tìm thấy công việc.');
  await assertCanLog(user, item);

  // BR-REC-001: mỗi kỳ chỉ một bản ghi.
  if (item.schedule_type === 'RECURRING' && item.recurrence_rule) {
    const key = periodKey(item.recurrence_rule, payload.period_start);
    const existing = await listExecutionLogs(item.id);
    const duplicate = existing.find(
      (log) => periodKey(item.recurrence_rule!, log.period_start) === key,
    );
    if (duplicate) {
      throw businessRule(`Kỳ ${key} đã có nhật ký thực hiện (${duplicate.record_code}).`);
    }
  }

  const deadlineResult = evaluateOccurrenceDeadline({
    status: payload.status,
    completed_at: payload.completed_at,
    occurrence_due_at: payload.occurrence_due_at,
  });

  const store = await getStore();
  const id = randomUUID();
  const recordCode = await generateRecordCode(item, payload.period_start);

  const created = await store.transaction(async (tx) => {
    const row = await tx.insert<Row & ExecutionLog>('execution_logs', {
      id,
      record_code: recordCode,
      work_item_id: item.id,
      period_start: payload.period_start,
      period_end: payload.period_end,
      occurrence_due_at: payload.occurrence_due_at,
      status: payload.status,
      progress: payload.progress,
      actual_hours: payload.actual_hours,
      deadline_result: deadlineResult,
      note: payload.note,
      skip_reason: payload.skip_reason,
      result_link: payload.result_link,
      responsible_user_id: payload.responsible_user_id,
      completed_at: payload.completed_at,
      created_by: user.actor.user_id,
      updated_by: user.actor.user_id,
      version: 1,
    });

    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'execution_log.create',
      entityType: 'execution_log',
      entityId: id,
      after: row,
      changedFields: Object.keys(row),
    });
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: item.id,
      verb: 'logged',
      summary: `${user.profile.full_name} ghi nhật ký kỳ ${payload.period_start} cho ${item.code}`,
    });

    return row;
  });

  revalidatePath(`/work-items/${item.id}`);
  revalidatePath('/my-work');
  revalidatePath('/reports');
  return created;
}

export async function updateExecutionLog(
  user: SessionUser,
  id: string,
  expectedVersion: number,
  payload: ExecutionLogPayload,
): Promise<ExecutionLog> {
  const current = await getExecutionLog(id);
  if (!current) throw notFound('Không tìm thấy nhật ký.');
  if (current.version !== expectedVersion) throw conflict(current.version);

  const item = await getWorkItem(current.work_item_id);
  if (!item) throw notFound('Không tìm thấy công việc.');

  const isOwn = current.created_by === user.actor.user_id;
  const canEditOthers = hasCapability(user.actor, 'work.edit_core');
  if (!isOwn && !canEditOthers) {
    throw forbidden('Bạn chỉ sửa được nhật ký do mình tạo.');
  }

  // NEED_CONFIRMATION C5: cửa sổ sửa nhật ký của chính mình.
  if (isOwn && !canEditOthers) {
    const windowHours = env().EXECUTION_LOG_EDIT_WINDOW_HOURS;
    const ageHours = (Date.now() - Date.parse(current.created_at)) / 3_600_000;
    if (ageHours > windowHours) {
      throw businessRule(
        `Quá thời hạn sửa nhật ký (${windowHours} giờ). Liên hệ quản lý nếu cần điều chỉnh.`,
      );
    }
  }

  if (payload.status === 'SKIPPED' && !payload.skip_reason?.trim()) {
    throw validation('Bỏ qua một kỳ bắt buộc ghi lý do.');
  }

  const store = await getStore();
  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & ExecutionLog>('execution_logs', id, {
      period_start: payload.period_start,
      period_end: payload.period_end,
      occurrence_due_at: payload.occurrence_due_at,
      status: payload.status,
      progress: payload.progress,
      actual_hours: payload.actual_hours,
      deadline_result: evaluateOccurrenceDeadline({
        status: payload.status,
        completed_at: payload.completed_at,
        occurrence_due_at: payload.occurrence_due_at,
      }),
      note: payload.note,
      skip_reason: payload.skip_reason,
      result_link: payload.result_link,
      responsible_user_id: payload.responsible_user_id,
      completed_at: payload.completed_at,
      updated_by: user.actor.user_id,
      version: current.version + 1,
    });

    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'execution_log.update',
      entityType: 'execution_log',
      entityId: id,
      before: current,
      after: row,
      changedFields: diffFields(
        current as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
      ),
    });

    return row;
  });

  revalidatePath(`/work-items/${current.work_item_id}`);
  revalidatePath('/reports');
  return updated;
}

/** Gợi ý kỳ hiện tại cho form — giảm thao tác nhập tay. */
export async function suggestPeriodFor(item: WorkItem) {
  const ctx = await getBocContext();
  if (item.schedule_type !== 'RECURRING' || !item.recurrence_rule) {
    return { period_start: ctx.today, period_end: null, occurrence_due_at: item.display_end };
  }
  const { periodRangeFor } = await import('@/domain/execution');
  const range = periodRangeFor(item.recurrence_rule, ctx.today);
  return { period_start: range.start, period_end: range.end, occurrence_due_at: range.end };
}
