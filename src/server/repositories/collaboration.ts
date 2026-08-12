import 'server-only';

import type {
  ActivityEvent,
  AppNotification,
  Attachment,
  AuditLog,
  Comment,
  ExecutionLog,
} from '@/domain/types';

import { getStore, type Filter, type Row } from '../db/store';

// ---------------------------------------------------------------------------
// Nhật ký thực hiện
// ---------------------------------------------------------------------------

export async function listExecutionLogs(workItemId: string): Promise<ExecutionLog[]> {
  const store = await getStore();
  return store.all<Row & ExecutionLog>('execution_logs', {
    filters: [{ field: 'work_item_id', op: 'eq', value: workItemId }],
    sort: [{ field: 'period_start', dir: 'desc' }],
  });
}

export async function listExecutionLogsFor(
  workItemIds: readonly string[],
): Promise<ExecutionLog[]> {
  if (workItemIds.length === 0) return [];
  const store = await getStore();
  const all = await store.all<Row & ExecutionLog>('execution_logs');
  const set = new Set(workItemIds);
  return all.filter((log) => set.has(log.work_item_id));
}

export async function getExecutionLog(id: string): Promise<ExecutionLog | null> {
  const store = await getStore();
  return store.get<Row & ExecutionLog>('execution_logs', id);
}

export async function listExecutionLogsByUser(userId: string): Promise<ExecutionLog[]> {
  const store = await getStore();
  return store.all<Row & ExecutionLog>('execution_logs', {
    filters: [{ field: 'responsible_user_id', op: 'eq', value: userId }],
    sort: [{ field: 'period_start', dir: 'desc' }],
  });
}

// ---------------------------------------------------------------------------
// Bình luận
// ---------------------------------------------------------------------------

export async function listComments(
  entityType: Comment['entity_type'],
  entityId: string,
): Promise<Comment[]> {
  const store = await getStore();
  const rows = await store.all<Row & Comment>('comments', {
    filters: [
      { field: 'entity_type', op: 'eq', value: entityType },
      { field: 'entity_id', op: 'eq', value: entityId },
    ],
    sort: [{ field: 'created_at', dir: 'asc' }],
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Tệp đính kèm
// ---------------------------------------------------------------------------

export async function listAttachments(
  entityType: Attachment['entity_type'],
  entityId: string,
): Promise<Attachment[]> {
  const store = await getStore();
  return store.all<Row & Attachment>('attachments', {
    filters: [
      { field: 'entity_type', op: 'eq', value: entityType },
      { field: 'entity_id', op: 'eq', value: entityId },
      { field: 'is_current', op: 'eq', value: true },
    ],
    sort: [{ field: 'created_at', dir: 'desc' }],
  });
}

/** Id các công việc đã có ít nhất một tệp kết quả — đầu vào của BR-STA-001. */
export async function workItemIdsWithResultFile(): Promise<Set<string>> {
  const store = await getStore();
  const rows = await store.all<Row & Attachment>('attachments', {
    filters: [
      { field: 'entity_type', op: 'eq', value: 'work_item' },
      { field: 'category', op: 'eq', value: 'RESULT' },
      { field: 'is_current', op: 'eq', value: true },
    ],
  });
  return new Set(rows.map((r) => r.entity_id));
}

// ---------------------------------------------------------------------------
// Thông báo
// ---------------------------------------------------------------------------

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<AppNotification[]> {
  const store = await getStore();
  const filters: Filter[] = [{ field: 'recipient_user_id', op: 'eq', value: userId }];
  if (options.unreadOnly) filters.push({ field: 'read_at', op: 'isNull' });

  return store.all<Row & AppNotification>('notifications', {
    filters,
    sort: [{ field: 'created_at', dir: 'desc' }],
    limit: options.limit,
  });
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const store = await getStore();
  const page = await store.list<Row & AppNotification>('notifications', {
    filters: [
      { field: 'recipient_user_id', op: 'eq', value: userId },
      { field: 'read_at', op: 'isNull' },
    ],
  });
  return page.total;
}

// ---------------------------------------------------------------------------
// Hoạt động & audit
// ---------------------------------------------------------------------------

export async function listActivity(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<ActivityEvent[]> {
  const store = await getStore();
  return store.all<Row & ActivityEvent>('activity_events', {
    filters: [
      { field: 'entity_type', op: 'eq', value: entityType },
      { field: 'entity_id', op: 'eq', value: entityId },
    ],
    sort: [{ field: 'created_at', dir: 'desc' }],
    limit,
  });
}

export async function listRecentActivity(limit = 30): Promise<ActivityEvent[]> {
  const store = await getStore();
  return store.all<Row & ActivityEvent>('activity_events', {
    sort: [{ field: 'created_at', dir: 'desc' }],
    limit,
  });
}

export async function listAuditLogs(options: {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AuditLog[]; total: number; page: number; pageSize: number }> {
  const store = await getStore();
  const filters: Filter[] = [];
  if (options.entityType) filters.push({ field: 'entity_type', op: 'eq', value: options.entityType });
  if (options.entityId) filters.push({ field: 'entity_id', op: 'eq', value: options.entityId });
  if (options.actorUserId) filters.push({ field: 'actor_user_id', op: 'eq', value: options.actorUserId });
  if (options.action) filters.push({ field: 'action', op: 'eq', value: options.action });

  const pageSize = options.pageSize ?? 50;
  const page = Math.max(1, options.page ?? 1);

  const all = await store.all<Row & AuditLog>('audit_logs', {
    filters,
    sort: [{ field: 'created_at', dir: 'desc' }],
  });

  return {
    rows: all.slice((page - 1) * pageSize, page * pageSize),
    total: all.length,
    page,
    pageSize,
  };
}
