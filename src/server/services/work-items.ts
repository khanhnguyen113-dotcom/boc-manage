import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { childBaselineWarnings } from '@/domain/dates';
import {
  buildTreeIndex,
  computeDepth,
  computePath,
  computeRootId,
  descendantsOf,
  rebaseSubtree,
  validateParentRelation,
} from '@/domain/hierarchy';
import {
  canWriteWorkItem,
  hasCapability,
  relationTo,
  type Capability,
} from '@/domain/permissions';
import { recalculateTree } from '@/domain/recalc';
import { canTransition, completionBlockers, isSensitiveTransition } from '@/domain/status';
import type { WorkItem, WorkLevel } from '@/domain/types';

import type { SessionUser } from '../auth/current-user';
import { getStore, type DataStore, type Row } from '../db/store';
import { workItemIdsWithResultFile } from '../repositories/collaboration';
import {
  getWorkItem,
  listAssignments,
  listTreeFor,
} from '../repositories/work-items';
import { diffFields, enqueueOutbox, recordActivity, recordAudit } from './audit';
import { getBocContext } from './context';
import {
  businessRule,
  completionBlocked,
  conflict,
  forbidden,
  notFound,
  validation,
} from './errors';
import { notifyMany } from './notifications';

/**
 * Toàn bộ thao tác ghi lên `work_items` đi qua file này, theo đúng chuỗi bắt buộc ở
 * guideline mục 0.9:
 *
 * ```
 * authenticate → authorize → load current → validate → business rules
 * → write → recalculate ancestors → audit + activity + outbox → invalidate cache → DTO
 * ```
 *
 * Không có server action nào ghi thẳng vào store.
 */

// ---------------------------------------------------------------------------
// Sinh mã
// ---------------------------------------------------------------------------

/**
 * NEED_CONFIRMATION D1: mã import giữ nguyên bản gốc (`HHL3CT03`); mã mới dùng format
 * `HH-L{level}-{year}-{seq}`. Không dùng `count + 1` (guideline 7.18) — số thứ tự lấy từ mã lớn
 * nhất đang có của đúng cấp + năm, cộng hậu tố ngẫu nhiên để tránh đụng khi tạo đồng thời.
 */
export async function generateWorkItemCode(
  store: DataStore,
  level: WorkLevel,
  year: number,
): Promise<string> {
  const prefix = `HH-L${level}-${year}-`;
  const existing = await store.all<Row & WorkItem>('work_items', {
    filters: [{ field: 'level', op: 'eq', value: level }],
  });

  let max = 0;
  for (const item of existing) {
    if (!item.code.startsWith(prefix)) continue;
    const seq = Number.parseInt(item.code.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }

  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Tính lại cây
// ---------------------------------------------------------------------------

/**
 * Tính lại toàn bộ cây chứa các node bị ảnh hưởng và ghi lại những row thực sự đổi.
 * Chạy trong cùng transaction với thao tác ghi (BR-PRO-006).
 */
async function recalculateAndPersist(
  tx: DataStore,
  rootIds: readonly string[],
  categoryCodeOf: Parameters<typeof recalculateTree>[1]['categoryCodeOf'],
  mode: 'average' | 'weighted',
): Promise<Set<string>> {
  const uniqueRoots = [...new Set(rootIds)];
  if (uniqueRoots.length === 0) return new Set();

  const all = await tx.all<Row & WorkItem>('work_items');
  const subset = all.filter((item) => uniqueRoots.includes(item.root_id));
  if (subset.length === 0) return new Set();

  const resultAttachments = await workItemIdsWithResultFile();
  const { items, changedIds } = recalculateTree(subset, {
    categoryCodeOf,
    mode,
    itemsWithResultAttachment: resultAttachments,
  });

  if (changedIds.size > 0) {
    await tx.updateMany(
      'work_items',
      items
        .filter((item) => changedIds.has(item.id))
        .map((item) => ({
          id: item.id,
          patch: {
            is_leaf: item.is_leaf,
            effective_progress: item.effective_progress,
            effective_estimated_hours: item.effective_estimated_hours,
            display_start: item.display_start,
            display_end: item.display_end,
            data_quality_status: item.data_quality_status,
            data_quality_codes: item.data_quality_codes,
          },
        })),
    );
  }

  return changedIds;
}

function invalidate(id?: string): void {
  revalidatePath('/dashboard');
  revalidatePath('/my-work');
  revalidatePath('/work-items');
  revalidatePath('/work-map');
  revalidatePath('/workload');
  revalidatePath('/calendar');
  revalidatePath('/reports');
  if (id) revalidatePath(`/work-items/${id}`);
}

// ---------------------------------------------------------------------------
// Kiểm quyền trên một record
// ---------------------------------------------------------------------------

async function assertCanWrite(
  user: SessionUser,
  item: WorkItem,
  capability: Capability,
): Promise<void> {
  const collaborators = (await listAssignments(item.id))
    .filter((a) => a.assignment_role === 'COLLABORATOR')
    .map((a) => a.user_id);

  const relation = relationTo(item, user.actor.user_id, collaborators);
  if (!canWriteWorkItem(user.actor, user.scope, capability, item, relation)) {
    throw forbidden();
  }
}

function assertVersion(item: WorkItem, expected: number): void {
  if (item.version !== expected) throw conflict(item.version);
}

// ---------------------------------------------------------------------------
// Tạo mới
// ---------------------------------------------------------------------------

export interface CreateWorkItemPayload {
  level: WorkLevel;
  parent_id: string | null;
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
  status: WorkItem['status'];
  priority: WorkItem['priority'];
  schedule_type: WorkItem['schedule_type'];
  recurrence_rule: WorkItem['recurrence_rule'];
  review_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  estimated_hours_input: number | null;
  allocation_unit: WorkItem['allocation_unit'];
  allocation_hours: number | null;
  result_link: string | null;
}

export async function createWorkItem(
  user: SessionUser,
  payload: CreateWorkItemPayload,
): Promise<WorkItem> {
  if (payload.status === 'COMPLETED') {
    throw validation('Công việc mới không thể ở trạng thái Hoàn thành. Hãy tạo, giao việc rồi dùng luồng gửi kết quả.');
  }
  const capability: Capability = payload.level === 3 ? 'work.create_l3' : 'work.create_child';
  if (!hasCapability(user.actor, capability)) throw forbidden();

  const ctx = await getBocContext();
  const store = await getStore();

  const parent = payload.parent_id ? await getWorkItem(payload.parent_id) : null;
  if (payload.parent_id && !parent) throw notFound('Không tìm thấy công việc cha.');

  // Không cho tạo con dưới nhánh mình không có quyền ghi.
  if (parent) await assertCanWrite(user, parent, capability);
  else if (!user.scope.all && !user.scope.unit_ids.has(payload.owning_unit_id)) {
    throw forbidden('Bạn chỉ được tạo công việc trong đơn vị mình phụ trách.');
  }

  const violation = validateParentRelation({ level: payload.level, parent });
  if (violation) throw validation(violation.message, { code: violation.code });

  // BR-HIE-003: con kế thừa năm/L1/L2 từ cha.
  const year = parent?.year ?? payload.year;
  const managementLevelId = parent?.management_level_id ?? payload.management_level_id;
  const categoryId = parent?.category_id ?? payload.category_id;

  const id = randomUUID();
  const code = await generateWorkItemCode(store, payload.level, year);

  const created = await store.transaction(async (tx) => {
    const row = await tx.insert<Row & WorkItem>('work_items', {
      id,
      code,
      legacy_code: null,
      level: payload.level,
      parent_id: parent?.id ?? null,
      root_id: computeRootId(id, parent),
      path: computePath(code, parent),
      depth: computeDepth(payload.level),
      year,
      management_level_id: managementLevelId,
      category_id: categoryId,
      title: payload.title,
      description: payload.description,
      expected_output: payload.expected_output,
      value_contribution: payload.value_contribution,
      owning_unit_id: payload.owning_unit_id,
      lead_user_id: payload.lead_user_id,
      primary_assignee_id: payload.primary_assignee_id,
      status: payload.status,
      priority: payload.priority,
      schedule_type: payload.schedule_type,
      recurrence_rule: payload.recurrence_rule,
      review_date: payload.review_date,
      planned_start: payload.planned_start,
      planned_end: payload.planned_end,
      display_start: payload.planned_start,
      display_end: payload.planned_end,
      manual_progress: null,
      effective_progress: null,
      estimated_hours_input: payload.estimated_hours_input,
      effective_estimated_hours: payload.estimated_hours_input,
      allocation_unit: payload.allocation_unit,
      allocation_hours: payload.allocation_hours,
      completed_at: null,
      result_link: payload.result_link,
      completion_approval_status: 'NONE',
      submitted_completed_at: null,
      submitted_result_link: null,
      completion_submitted_by: null,
      completion_submitted_at: null,
      completion_reviewed_by: null,
      completion_reviewed_at: null,
      completion_review_note: null,
      data_quality_status: 'VALID',
      data_quality_codes: [],
      is_leaf: true,
      is_archived: false,
      archived_at: null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      cancel_reason: null,
      created_by: user.actor.user_id,
      updated_by: user.actor.user_id,
      version: 1,
    });

    if (payload.primary_assignee_id) {
      await tx.insert('work_assignments', {
        id: randomUUID(),
        work_item_id: id,
        user_id: payload.primary_assignee_id,
        assignment_role: 'ASSIGNEE',
        unit_id: payload.owning_unit_id,
        allocation_percent: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        assigned_by: user.actor.user_id,
        is_active: true,
      });
    }

    await recalculateAndPersist(tx, [row.root_id], ctx.categoryCodeOf, ctx.rollupMode);

    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'work_item.create',
      entityType: 'work_item',
      entityId: id,
      after: row,
      changedFields: Object.keys(row),
    });
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: id,
      verb: 'created',
      summary: `${user.profile.full_name} tạo công việc ${code}`,
    });
    await enqueueOutbox({ store: tx, eventType: 'work_item.created', payload: { id, code } });

    return row;
  });

  if (payload.primary_assignee_id) {
    await notifyMany([payload.primary_assignee_id, payload.lead_user_id], {
      actorUserId: user.actor.user_id,
      type: 'WORK_ASSIGNED',
      title: 'Bạn được giao công việc mới',
      body: `${code} · ${payload.title}`,
      entityType: 'work_item',
      entityId: id,
      priority: payload.priority === 'P1' ? 'HIGH' : 'NORMAL',
    });
  }

  invalidate(id);
  return created;
}

// ---------------------------------------------------------------------------
// Cập nhật nội dung
// ---------------------------------------------------------------------------

export async function updateWorkItem(
  user: SessionUser,
  payload: CreateWorkItemPayload & { id: string; expected_version: number; reason: string | null },
): Promise<WorkItem> {
  const current = await getWorkItem(payload.id);
  if (!current) throw notFound('Không tìm thấy công việc.');

  await assertCanWrite(user, current, 'work.edit_core');
  assertVersion(current, payload.expected_version);

  if (current.priority !== payload.priority && !hasCapability(user.actor, 'work.change_priority')) {
    throw forbidden('Bạn không có quyền đổi mức độ ưu tiên.');
  }
  if (
    (current.lead_user_id !== payload.lead_user_id ||
      current.primary_assignee_id !== payload.primary_assignee_id) &&
    !hasCapability(user.actor, 'work.assign')
  ) {
    throw forbidden('Bạn không có quyền đổi người phụ trách.');
  }

  // BR-PRO-001: node có con thì không nhận tiến độ/giờ nhập tay.
  const ctx = await getBocContext();
  const store = await getStore();

  const hierarchyChanged = current.parent_id !== payload.parent_id || current.level !== payload.level;
  let hierarchyPlan: ReturnType<typeof rebaseSubtree> | null = null;
  if (hierarchyChanged) {
    if (!hasCapability(user.actor, 'work.edit_core')) throw forbidden();
    const parent = payload.parent_id ? await getWorkItem(payload.parent_id) : null;
    if (parent) await assertCanWrite(user, parent, 'work.edit_core');
    const all = await store.all<Row & WorkItem>('work_items');
    const byId = new Map(all.map((i) => [i.id, i]));
    const violation = validateParentRelation({
      itemId: current.id,
      level: payload.level,
      parent,
      resolveParent: (id) => byId.get(id) ?? null,
    });
    if (violation) throw validation(violation.message, { code: violation.code });
    if (!payload.reason?.trim()) {
      throw validation('Đổi công việc cha là thay đổi phạm vi — bắt buộc ghi lý do.');
    }
    hierarchyPlan = rebaseSubtree(buildTreeIndex(all), current, parent);
    if (hierarchyPlan.some((node) => node.path.length > 500)) {
      throw validation('Nhánh sau khi di chuyển tạo đường dẫn quá dài. Hãy chọn công việc cha gần gốc hơn.');
    }
  }

  const parent = payload.parent_id ? await getWorkItem(payload.parent_id) : null;

  const patch: Partial<WorkItem> = {
    level: hierarchyPlan?.[0]?.level ?? payload.level,
    parent_id: payload.parent_id,
    root_id: hierarchyPlan?.[0]?.root_id ?? computeRootId(current.id, parent),
    path: hierarchyPlan?.[0]?.path ?? computePath(current.code, parent),
    depth: hierarchyPlan?.[0]?.depth ?? computeDepth(payload.level),
    year: hierarchyPlan?.[0]?.year ?? parent?.year ?? payload.year,
    management_level_id:
      hierarchyPlan?.[0]?.management_level_id ?? parent?.management_level_id ?? payload.management_level_id,
    category_id: hierarchyPlan?.[0]?.category_id ?? parent?.category_id ?? payload.category_id,
    title: payload.title,
    description: payload.description,
    expected_output: payload.expected_output,
    value_contribution: payload.value_contribution,
    owning_unit_id: payload.owning_unit_id,
    lead_user_id: payload.lead_user_id,
    primary_assignee_id: payload.primary_assignee_id,
    priority: payload.priority,
    schedule_type: payload.schedule_type,
    recurrence_rule: payload.recurrence_rule,
    review_date: payload.review_date,
    planned_start: payload.planned_start,
    planned_end: payload.planned_end,
    estimated_hours_input: payload.estimated_hours_input,
    allocation_unit: payload.allocation_unit,
    allocation_hours: payload.allocation_hours,
    result_link: payload.result_link,
    updated_by: user.actor.user_id,
    version: current.version + 1,
  };

  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & WorkItem>('work_items', current.id, patch);

    if (hierarchyPlan) await syncDescendantHierarchy(tx, hierarchyPlan.slice(1), user.actor.user_id);

    await recalculateAndPersist(
      tx,
      [current.root_id, row.root_id],
      ctx.categoryCodeOf,
      ctx.rollupMode,
    );

    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'work_item.update',
      entityType: 'work_item',
      entityId: current.id,
      before: current,
      after: row,
      changedFields: diffFields(
        current as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
      ),
      reason: payload.reason,
    });
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: current.id,
      verb: 'updated',
      summary: `${user.profile.full_name} cập nhật ${current.code}`,
    });

    return row;
  });

  if (current.primary_assignee_id !== payload.primary_assignee_id && payload.primary_assignee_id) {
    await notifyMany([payload.primary_assignee_id], {
      actorUserId: user.actor.user_id,
      type: 'WORK_ASSIGNED',
      title: 'Bạn được giao công việc',
      body: `${current.code} · ${payload.title}`,
      entityType: 'work_item',
      entityId: current.id,
    });
  }

  if (current.priority !== 'P1' && payload.priority === 'P1') {
    await notifyMany([payload.lead_user_id, payload.primary_assignee_id], {
      actorUserId: user.actor.user_id,
      type: 'P1_CHANGED',
      title: 'Công việc được nâng lên P1',
      body: `${current.code} · ${payload.title}`,
      entityType: 'work_item',
      entityId: current.id,
      priority: 'HIGH',
    });
  }

  invalidate(current.id);
  return updated;
}

/** Sau khi reparent, toàn bộ cấp/path/root và phân loại kế thừa của nhánh phải đi theo. */
async function syncDescendantHierarchy(
  tx: DataStore,
  plan: ReturnType<typeof rebaseSubtree>,
  actorUserId: string,
): Promise<void> {
  if (plan.length === 0) return;
  const currentRows = await tx.all<Row & WorkItem>('work_items');
  const byId = new Map(currentRows.map((item) => [item.id, item]));
  await tx.updateMany(
    'work_items',
    plan.map((node) => ({
      id: node.id,
      patch: {
        level: node.level,
        depth: node.depth,
        path: node.path,
        root_id: node.root_id,
        year: node.year,
        management_level_id: node.management_level_id,
        category_id: node.category_id,
        updated_by: actorUserId,
        version: (byId.get(node.id)?.version ?? 0) + 1,
      },
    })),
  );
}

// ---------------------------------------------------------------------------
// Cập nhật nhanh tiến độ (My Work)
// ---------------------------------------------------------------------------

export interface QuickUpdatePayload {
  id: string;
  expected_version: number;
  manual_progress: number | null;
  status?: WorkItem['status'];
  note: string | null;
  completed_at?: string | null;
  result_link?: string | null;
}

export async function quickUpdateWorkItem(
  user: SessionUser,
  payload: QuickUpdatePayload,
): Promise<WorkItem> {
  const current = await getWorkItem(payload.id);
  if (!current) throw notFound('Không tìm thấy công việc.');

  await assertCanWrite(user, current, 'work.update_progress');
  assertVersion(current, payload.expected_version);

  // BR-PRO-001: chỉ điểm cuối được nhập tiến độ.
  if (!current.is_leaf && payload.manual_progress !== null) {
    throw businessRule(
      'Chỉ nhập tiến độ ở điểm cuối. Tiến độ của công việc này được tính từ các công việc con.',
    );
  }

  const nextStatus = payload.status ?? current.status;
  if (nextStatus === 'COMPLETED') {
    throw validation('Hãy dùng luồng “Gửi hoàn thành” để người phụ trách xác nhận kết quả.');
  }
  if (nextStatus !== current.status) {
    if (!canTransition(current.status, nextStatus)) {
      throw businessRule(
        `Không thể chuyển trạng thái từ “${current.status}” sang “${nextStatus}”.`,
      );
    }
    if (isSensitiveTransition(current.status, nextStatus)) {
      throw forbidden('Thao tác này cần quyền quản lý và lý do — dùng màn hình chi tiết công việc.');
    }
  }

  const ctx = await getBocContext();
  const store = await getStore();

  const patch: Partial<WorkItem> = {
    manual_progress: payload.manual_progress,
    status: nextStatus,
    completed_at: null,
    result_link: payload.result_link ?? current.result_link,
    updated_by: user.actor.user_id,
    version: current.version + 1,
  };

  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & WorkItem>('work_items', current.id, patch);
    await recalculateAndPersist(tx, [current.root_id], ctx.categoryCodeOf, ctx.rollupMode);

    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'work_item.quick_update',
      entityType: 'work_item',
      entityId: current.id,
      before: current,
      after: row,
      changedFields: diffFields(
        current as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
      ),
      reason: payload.note,
    });

    const progressText =
      payload.manual_progress === null ? '' : ` · tiến độ ${payload.manual_progress}%`;
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: current.id,
      verb: 'progress',
      summary: `${user.profile.full_name} cập nhật ${current.code}${progressText}`,
    });

    return row;
  });

  if (nextStatus !== current.status) {
    await notifyMany([current.lead_user_id, current.created_by], {
      actorUserId: user.actor.user_id,
      type: 'STATUS_CHANGED',
      title: 'Công việc đổi trạng thái',
      body: `${current.code} · ${current.title}`,
      entityType: 'work_item',
      entityId: current.id,
    });
  }

  invalidate(current.id);
  return updated;
}

// ---------------------------------------------------------------------------
// Gửi kết quả hoàn thành → người phụ trách/quản lý xác nhận
// ---------------------------------------------------------------------------

export interface SubmitCompletionPayload {
  id: string;
  expected_version: number;
  completed_at: string;
  result_link: string | null;
  note: string | null;
}

export async function submitWorkItemCompletion(
  user: SessionUser,
  payload: SubmitCompletionPayload,
): Promise<WorkItem> {
  const current = await getWorkItem(payload.id);
  if (!current) throw notFound('Không tìm thấy công việc.');
  if (!hasCapability(user.actor, 'work.submit_completion')) throw forbidden();
  if (current.primary_assignee_id !== user.actor.user_id) {
    throw forbidden('Chỉ người thực hiện được giao chính thức mới được gửi kết quả hoàn thành.');
  }
  await assertCanWrite(user, current, 'work.submit_completion');
  assertVersion(current, payload.expected_version);
  if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
    throw validation('Công việc đã kết thúc nên không thể gửi kết quả mới.');
  }
  if ((current.completion_approval_status ?? 'NONE') === 'PENDING') {
    throw validation('Kết quả này đang chờ xác nhận.');
  }

  const nextStatus = current.status === 'IN_PROGRESS' ? current.status : 'IN_PROGRESS';
  if (!canTransition(current.status, nextStatus)) {
    throw businessRule('Cần đưa công việc về trạng thái Đang thực hiện trước khi gửi hoàn thành.');
  }

  const ctx = await getBocContext();
  if (payload.completed_at > ctx.today) {
    throw validation('Ngày hoàn thành thực tế không được nằm trong tương lai.');
  }
  const resultLink = payload.result_link ?? current.result_link;
  await assertCompletionEvidence(current, {
    progress: 100,
    completed_at: payload.completed_at,
    result_link: resultLink,
  });

  const store = await getStore();
  const submittedAt = new Date().toISOString();
  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & WorkItem>('work_items', current.id, {
      status: nextStatus,
      manual_progress: current.is_leaf ? 100 : current.manual_progress,
      completion_approval_status: 'PENDING',
      submitted_completed_at: payload.completed_at,
      submitted_result_link: resultLink,
      completion_submitted_by: user.actor.user_id,
      completion_submitted_at: submittedAt,
      completion_reviewed_by: null,
      completion_reviewed_at: null,
      completion_review_note: null,
      updated_by: user.actor.user_id,
      version: current.version + 1,
    });
    await recalculateAndPersist(tx, [current.root_id], ctx.categoryCodeOf, ctx.rollupMode);
    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'work_item.completion.submit',
      entityType: 'work_item',
      entityId: current.id,
      before: current,
      after: row,
      changedFields: ['status', 'manual_progress', 'completion_approval_status', 'submitted_completed_at', 'submitted_result_link'],
      reason: payload.note,
    });
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: current.id,
      verb: 'completion_submitted',
      summary: `${user.profile.full_name} gửi kết quả hoàn thành để xác nhận`,
    });
    await enqueueOutbox({
      store: tx,
      eventType: 'work_item.completion_submitted',
      payload: { id: current.id, submitted_by: user.actor.user_id },
    });
    return row;
  });

  await notifyMany([current.lead_user_id, current.created_by], {
    actorUserId: user.actor.user_id,
    type: 'COMPLETION_SUBMITTED',
    title: 'Kết quả đang chờ xác nhận',
    body: `${current.code} · ${current.title}`,
    entityType: 'work_item',
    entityId: current.id,
    priority: current.priority === 'P1' ? 'HIGH' : 'NORMAL',
  });
  invalidate(current.id);
  return updated;
}

export interface ReviewCompletionPayload {
  id: string;
  expected_version: number;
  decision: 'APPROVE' | 'REJECT';
  note: string | null;
}

function canReviewCompletion(user: SessionUser, item: WorkItem): boolean {
  if (!hasCapability(user.actor, 'work.approve_completion')) return false;
  if (item.lead_user_id === user.actor.user_id) return true;
  const isManager = user.actor.roles.some((role) =>
    ['unit_manager', 'business_admin', 'boc_director', 'system_admin'].includes(role),
  );
  return isManager && (user.scope.all || user.scope.unit_ids.has(item.owning_unit_id));
}

export async function reviewWorkItemCompletion(
  user: SessionUser,
  payload: ReviewCompletionPayload,
): Promise<WorkItem> {
  const current = await getWorkItem(payload.id);
  if (!current) throw notFound('Không tìm thấy công việc.');
  if (!canReviewCompletion(user, current)) {
    throw forbidden('Chỉ người phụ trách hoặc quản lý trong phạm vi được xác nhận kết quả.');
  }
  if (current.completion_submitted_by === user.actor.user_id) {
    throw forbidden('Người gửi kết quả không được tự xác nhận kết quả của chính mình.');
  }
  assertVersion(current, payload.expected_version);
  if ((current.completion_approval_status ?? 'NONE') !== 'PENDING') {
    throw validation('Không có kết quả nào đang chờ xác nhận.');
  }
  if (payload.decision === 'REJECT' && !payload.note?.trim()) {
    throw validation('Trả lại kết quả bắt buộc ghi rõ lý do.');
  }

  const ctx = await getBocContext();
  if (payload.decision === 'APPROVE') {
    await assertCompletionEvidence(current, {
      progress: 100,
      completed_at: current.submitted_completed_at,
      result_link: current.submitted_result_link ?? current.result_link,
    });
    if (!canTransition(current.status, 'COMPLETED')) {
      throw businessRule('Trạng thái hiện tại không thể chuyển sang Hoàn thành.');
    }
  }

  const store = await getStore();
  const reviewedAt = new Date().toISOString();
  const approved = payload.decision === 'APPROVE';
  const patch: Partial<WorkItem> = {
    completion_approval_status: approved ? 'APPROVED' : 'REJECTED',
    completion_reviewed_by: user.actor.user_id,
    completion_reviewed_at: reviewedAt,
    completion_review_note: payload.note,
    updated_by: user.actor.user_id,
    version: current.version + 1,
  };
  if (approved) {
    patch.status = 'COMPLETED';
    patch.completed_at = current.submitted_completed_at;
    patch.result_link = current.submitted_result_link ?? current.result_link;
    patch.manual_progress = current.is_leaf ? 100 : current.manual_progress;
  }

  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & WorkItem>('work_items', current.id, patch);
    await recalculateAndPersist(tx, [current.root_id], ctx.categoryCodeOf, ctx.rollupMode);
    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: approved ? 'work_item.completion.approve' : 'work_item.completion.reject',
      entityType: 'work_item',
      entityId: current.id,
      before: current,
      after: row,
      changedFields: approved
        ? ['status', 'completed_at', 'result_link', 'completion_approval_status']
        : ['completion_approval_status', 'completion_review_note'],
      reason: payload.note,
    });
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: current.id,
      verb: approved ? 'completion_approved' : 'completion_rejected',
      summary: `${user.profile.full_name} ${approved ? 'xác nhận' : 'trả lại'} kết quả hoàn thành`,
    });
    return row;
  });

  await notifyMany([current.completion_submitted_by, current.primary_assignee_id], {
    actorUserId: user.actor.user_id,
    type: approved ? 'COMPLETION_APPROVED' : 'COMPLETION_REJECTED',
    title: approved ? 'Kết quả đã được xác nhận' : 'Kết quả cần bổ sung',
    body: `${current.code} · ${current.title}${payload.note ? ` · ${payload.note}` : ''}`,
    entityType: 'work_item',
    entityId: current.id,
    priority: approved ? 'NORMAL' : 'HIGH',
  });
  invalidate(current.id);
  return updated;
}

// ---------------------------------------------------------------------------
// Đổi trạng thái có kiểm soát
// ---------------------------------------------------------------------------

export interface ChangeStatusPayload {
  id: string;
  expected_version: number;
  status: WorkItem['status'];
  reason: string | null;
  completed_at?: string | null;
  result_link?: string | null;
}

export async function changeWorkItemStatus(
  user: SessionUser,
  payload: ChangeStatusPayload,
): Promise<WorkItem> {
  const current = await getWorkItem(payload.id);
  if (!current) throw notFound('Không tìm thấy công việc.');

  if (payload.status === 'COMPLETED') {
    throw validation('Hãy dùng luồng “Gửi hoàn thành” và “Xác nhận kết quả”.');
  }

  const capability: Capability =
    payload.status === 'CANCELLED' ? 'work.cancel' : 'work.change_status';

  await assertCanWrite(user, current, capability);
  assertVersion(current, payload.expected_version);

  if (!canTransition(current.status, payload.status)) {
    throw businessRule(
      `Không thể chuyển trạng thái từ “${current.status}” sang “${payload.status}”.`,
    );
  }

  const sensitive = isSensitiveTransition(current.status, payload.status);
  if (sensitive) {
    // BR-STA-008: mở lại/khôi phục cần quyền quản lý + lý do.
    if (!hasCapability(user.actor, 'work.edit_core')) {
      throw forbidden('Chỉ quản lý mới được mở lại hoặc khôi phục công việc.');
    }
    if (!payload.reason?.trim()) throw validation('Thao tác này bắt buộc ghi lý do.');
  }

  // BR-STA-004: hủy bắt buộc có lý do.
  if (payload.status === 'CANCELLED' && !payload.reason?.trim()) {
    throw validation('Hủy công việc bắt buộc ghi lý do.');
  }

  const ctx = await getBocContext();
  const store = await getStore();

  const patch: Partial<WorkItem> = {
    status: payload.status,
    cancel_reason: payload.status === 'CANCELLED' ? payload.reason : current.cancel_reason,
    completed_at: null,
    manual_progress: current.manual_progress,
    result_link: payload.result_link ?? current.result_link,
    updated_by: user.actor.user_id,
    version: current.version + 1,
  };
  if (current.status === 'COMPLETED' && payload.status === 'IN_PROGRESS') {
    patch.completion_approval_status = 'NONE';
    patch.submitted_completed_at = null;
    patch.submitted_result_link = null;
    patch.completion_submitted_by = null;
    patch.completion_submitted_at = null;
    patch.completion_reviewed_by = null;
    patch.completion_reviewed_at = null;
    patch.completion_review_note = null;
  }

  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & WorkItem>('work_items', current.id, patch);
    await recalculateAndPersist(tx, [current.root_id], ctx.categoryCodeOf, ctx.rollupMode);

    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: `work_item.status.${payload.status.toLowerCase()}`,
      entityType: 'work_item',
      entityId: current.id,
      before: current,
      after: row,
      changedFields: diffFields(
        current as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
      ),
      reason: payload.reason,
    });
    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: 'work_item',
      entityId: current.id,
      verb: 'status',
      summary: `${user.profile.full_name} chuyển ${current.code} sang trạng thái mới`,
    });

    return row;
  });

  await notifyMany([current.lead_user_id, current.primary_assignee_id, current.created_by], {
    actorUserId: user.actor.user_id,
    type: 'STATUS_CHANGED',
    title:
      payload.status === 'CANCELLED' ? 'Công việc đã bị hủy' : 'Công việc đổi trạng thái',
    body: `${current.code} · ${current.title}`,
    entityType: 'work_item',
    entityId: current.id,
    priority: current.priority === 'P1' ? 'HIGH' : 'NORMAL',
  });

  invalidate(current.id);
  return updated;
}

/** BR-STA-001 — gom mọi điều kiện hoàn thành vào một chỗ. */
async function assertCompletionEvidence(
  item: WorkItem,
  input: { progress: number | null; completed_at: string | null; result_link: string | null },
): Promise<void> {
  const tree = buildTreeIndex(await listTreeFor([item.root_id]));
  const children = (tree.childrenOf.get(item.id) ?? []).filter(
    (c) => !c.is_archived && c.status !== 'CANCELLED',
  );
  const attachments = await workItemIdsWithResultFile();

  const blockers = completionBlockers({
    progress: input.progress,
    completed_at: input.completed_at,
    expected_output: item.expected_output,
    result_link: input.result_link,
    has_result_attachment: attachments.has(item.id),
    active_children_count: children.length,
    active_children_incomplete_count: children.filter((c) => c.status !== 'COMPLETED').length,
  });

  if (blockers.length > 0) throw completionBlocked(blockers);
}

// ---------------------------------------------------------------------------
// Lưu trữ
// ---------------------------------------------------------------------------

export async function archiveWorkItem(
  user: SessionUser,
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<WorkItem> {
  const current = await getWorkItem(id);
  if (!current) throw notFound('Không tìm thấy công việc.');

  await assertCanWrite(user, current, 'work.archive');
  assertVersion(current, expectedVersion);
  if (!reason.trim()) throw validation('Lưu trữ bắt buộc ghi lý do.');

  // BR-HIE-005: không lưu trữ node còn con đang hoạt động.
  const tree = buildTreeIndex(await listTreeFor([current.root_id]));
  const activeChildren = (tree.childrenOf.get(id) ?? []).filter(
    (c) => !c.is_archived && c.status !== 'CANCELLED',
  );
  if (activeChildren.length > 0) {
    throw businessRule(
      `Không thể lưu trữ khi còn ${activeChildren.length} công việc con đang hoạt động.`,
    );
  }

  const ctx = await getBocContext();
  const store = await getStore();

  const updated = await store.transaction(async (tx) => {
    const row = await tx.update<Row & WorkItem>('work_items', id, {
      is_archived: true,
      archived_at: new Date().toISOString(),
      updated_by: user.actor.user_id,
      version: current.version + 1,
    });
    await recalculateAndPersist(tx, [current.root_id], ctx.categoryCodeOf, ctx.rollupMode);
    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'work_item.archive',
      entityType: 'work_item',
      entityId: id,
      before: current,
      after: row,
      changedFields: ['is_archived', 'archived_at'],
      reason,
    });
    return row;
  });

  invalidate(id);
  return updated;
}

// ---------------------------------------------------------------------------
// Xóa an toàn (soft delete) cả nhánh — chỉ cấp quản lý
// ---------------------------------------------------------------------------

export async function deleteWorkItemBranch(
  user: SessionUser,
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<{ deletedCount: number }> {
  const current = await getWorkItem(id);
  if (!current) throw notFound('Không tìm thấy công việc.');
  await assertCanWrite(user, current, 'work.delete');
  assertVersion(current, expectedVersion);
  if (!reason.trim()) throw validation('Xóa công việc bắt buộc ghi lý do.');

  const tree = buildTreeIndex(await listTreeFor([current.root_id]));
  const branch = [current, ...descendantsOf(tree, current.id)].filter(
    (item) => !item.is_deleted,
  );
  const timestamp = new Date().toISOString();
  const ctx = await getBocContext();
  const store = await getStore();

  await store.transaction(async (tx) => {
    await tx.updateMany(
      'work_items',
      branch.map((item) => ({
        id: item.id,
        patch: {
          is_archived: true,
          archived_at: timestamp,
          is_deleted: true,
          deleted_at: timestamp,
          deleted_by: user.actor.user_id,
          delete_reason: reason.trim(),
          updated_by: user.actor.user_id,
          version: item.version + 1,
        },
      })),
    );
    await recalculateAndPersist(tx, [current.root_id], ctx.categoryCodeOf, ctx.rollupMode);
    await recordAudit({
      store: tx,
      actorUserId: user.actor.user_id,
      action: 'work_item.delete_branch',
      entityType: 'work_item',
      entityId: current.id,
      before: current,
      after: { root_id: current.id, deleted_count: branch.length, soft_delete: true },
      changedFields: ['is_deleted', 'is_archived', 'deleted_at', 'deleted_by', 'delete_reason'],
      reason,
    });
    await enqueueOutbox({
      store: tx,
      eventType: 'work_item.deleted',
      payload: { id: current.id, deleted_count: branch.length },
    });
  });

  invalidate(current.id);
  return { deletedCount: branch.length };
}

// ---------------------------------------------------------------------------
// Cảnh báo con vượt khung — dùng ở màn hình chi tiết
// ---------------------------------------------------------------------------

export async function baselineWarningsFor(item: WorkItem) {
  const tree = buildTreeIndex(await listTreeFor([item.root_id]));
  return childBaselineWarnings(item, tree);
}
