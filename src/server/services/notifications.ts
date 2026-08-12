import 'server-only';

import { randomUUID } from 'node:crypto';

import type { AppNotification, NotificationType } from '@/domain/types';

import { getStore, type DataStore, type Row } from '../db/store';

/**
 * Thông báo trong ứng dụng — guideline 6.8.
 *
 * Quy tắc bắt buộc:
 * - Chống trùng theo `event + resource + recipient + cửa sổ thời gian`.
 * - **Không** gửi thông báo cho chính người vừa thao tác.
 * - Mỗi thông báo có deep link tới record nguồn.
 */

export interface NotifyInput {
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  priority?: AppNotification['priority'];
  /** Cửa sổ chống trùng. Mặc định theo ngày. */
  dedupeWindow?: string;
  store?: DataStore;
}

export async function notify(input: NotifyInput): Promise<void> {
  // Không tự thông báo cho chính mình.
  if (input.recipientUserId === input.actorUserId) return;

  const store = input.store ?? (await getStore());
  const window = input.dedupeWindow ?? new Date().toISOString().slice(0, 10);
  const dedupeKey = `${input.type}|${input.entityType}:${input.entityId}|${input.recipientUserId}|${window}`;

  const existing = await store.all<Row & AppNotification>('notifications', {
    filters: [{ field: 'dedupe_key', op: 'eq', value: dedupeKey }],
    limit: 1,
  });
  if (existing.length > 0) return;

  await store.insert('notifications', {
    id: randomUUID(),
    recipient_user_id: input.recipientUserId,
    type: input.type,
    title: input.title,
    body: input.body,
    entity_type: input.entityType,
    entity_id: input.entityId,
    dedupe_key: dedupeKey,
    priority: input.priority ?? 'NORMAL',
    read_at: null,
  });
}

/** Gửi cho nhiều người, tự loại trùng và loại chính actor. */
export async function notifyMany(
  recipients: readonly (string | null | undefined)[],
  input: Omit<NotifyInput, 'recipientUserId'>,
): Promise<void> {
  const unique = new Set(recipients.filter((r): r is string => Boolean(r)));
  for (const recipient of unique) {
    await notify({ ...input, recipientUserId: recipient });
  }
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const store = await getStore();
  const notification = await store.get<Row & AppNotification>('notifications', id);
  // Chỉ người nhận mới đánh dấu được — chặn IDOR.
  if (!notification || notification.recipient_user_id !== userId) return;
  if (notification.read_at) return;
  await store.update('notifications', id, { read_at: new Date().toISOString() });
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const store = await getStore();
  const unread = await store.all<Row & AppNotification>('notifications', {
    filters: [
      { field: 'recipient_user_id', op: 'eq', value: userId },
      { field: 'read_at', op: 'isNull' },
    ],
  });
  if (unread.length === 0) return 0;
  const now = new Date().toISOString();
  await store.updateMany(
    'notifications',
    unread.map((n) => ({ id: n.id, patch: { read_at: now } })),
  );
  return unread.length;
}
