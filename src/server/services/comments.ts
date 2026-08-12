import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { canReadWorkItem, hasCapability, relationTo } from '@/domain/permissions';
import type { Comment } from '@/domain/types';

import type { SessionUser } from '../auth/current-user';
import { getStore, type Row } from '../db/store';
import { getWorkItem, listAssignments } from '../repositories/work-items';
import { getSessionUserById } from './users';
import { recordActivity, recordAudit } from './audit';
import { forbidden, notFound, validation } from './errors';
import { notify } from './notifications';

/**
 * Bình luận và @mention — guideline 6.7.
 *
 * Hai ràng buộc đáng lưu ý:
 * - Chỉ @mention được người **có quyền xem** resource đó, tránh rò rỉ tồn tại của công việc.
 * - Không hard delete: kiểm duyệt chỉ ẩn (`is_hidden`).
 */

export interface CommentPayload {
  entity_type: Comment['entity_type'];
  entity_id: string;
  body: string;
  mentioned_user_ids: string[];
}

export async function createComment(
  user: SessionUser,
  payload: CommentPayload,
): Promise<Comment> {
  if (!hasCapability(user.actor, 'comment.create')) throw forbidden();
  if (!payload.body.trim()) throw validation('Nội dung bình luận không được trống.');

  const item = await getWorkItem(
    payload.entity_type === 'work_item' ? payload.entity_id : payload.entity_id,
  );
  if (payload.entity_type === 'work_item' && !item) throw notFound('Không tìm thấy công việc.');

  if (item) {
    const collaborators = (await listAssignments(item.id)).map((a) => a.user_id);
    const relation = relationTo(item, user.actor.user_id, collaborators);
    if (!canReadWorkItem(user.actor, user.scope, item, relation)) throw forbidden();
  }

  // Lọc mention: chỉ giữ người thật sự xem được resource.
  const allowedMentions: string[] = [];
  for (const userId of payload.mentioned_user_ids) {
    const target = await getSessionUserById(userId);
    if (!target || !item) continue;
    const collaborators = (await listAssignments(item.id)).map((a) => a.user_id);
    const relation = relationTo(item, userId, collaborators);
    if (canReadWorkItem(target.actor, target.scope, item, relation)) allowedMentions.push(userId);
  }

  const store = await getStore();
  const id = randomUUID();

  const created = await store.transaction(async (tx) => {
    const row = await tx.insert<Row & Comment>('comments', {
      id,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      parent_comment_id: null,
      body: payload.body.trim(),
      author_user_id: user.actor.user_id,
      mentioned_user_ids: allowedMentions,
      edited_at: null,
      is_hidden: false,
      hidden_by: null,
    });

    await recordActivity({
      store: tx,
      actorUserId: user.actor.user_id,
      entityType: payload.entity_type,
      entityId: payload.entity_id,
      verb: 'commented',
      summary: `${user.profile.full_name} bình luận`,
    });

    return row;
  });

  for (const userId of allowedMentions) {
    await notify({
      recipientUserId: userId,
      actorUserId: user.actor.user_id,
      type: 'MENTIONED',
      title: `${user.profile.full_name} nhắc tới bạn`,
      body: payload.body.slice(0, 160),
      entityType: payload.entity_type,
      entityId: payload.entity_id,
      dedupeWindow: id,
    });
  }

  if (item) {
    // Người theo dõi công việc cũng nên biết có trao đổi mới.
    for (const userId of new Set(
      [item.lead_user_id, item.primary_assignee_id].filter((v): v is string => Boolean(v)),
    )) {
      if (allowedMentions.includes(userId)) continue;
      await notify({
        recipientUserId: userId,
        actorUserId: user.actor.user_id,
        type: 'MENTIONED',
        title: 'Có bình luận mới',
        body: `${item.code} · ${payload.body.slice(0, 120)}`,
        entityType: 'work_item',
        entityId: item.id,
        priority: 'LOW',
        dedupeWindow: id,
      });
    }
  }

  revalidatePath(`/work-items/${payload.entity_id}`);
  return created;
}

/** Kiểm duyệt: ẩn chứ không xóa (guideline 6.7). */
export async function hideComment(user: SessionUser, commentId: string): Promise<void> {
  if (!hasCapability(user.actor, 'comment.moderate')) throw forbidden();

  const store = await getStore();
  const comment = await store.get<Row & Comment>('comments', commentId);
  if (!comment) throw notFound('Không tìm thấy bình luận.');

  await store.update('comments', commentId, {
    is_hidden: true,
    hidden_by: user.actor.user_id,
  });

  await recordAudit({
    actorUserId: user.actor.user_id,
    action: 'comment.hide',
    entityType: 'comment',
    entityId: commentId,
    before: comment,
    changedFields: ['is_hidden', 'hidden_by'],
  });

  revalidatePath(`/work-items/${comment.entity_id}`);
}
