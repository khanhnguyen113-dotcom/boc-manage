import 'server-only';

import { randomUUID } from 'node:crypto';

import type { DataStore } from '../db/store';
import { getStore } from '../db/store';

/**
 * Audit log append-only + dòng hoạt động thân thiện + outbox.
 *
 * Guideline 7.15/7.16 và mục 0.10: **không** có API sửa/xóa audit. Mọi mutation nhạy cảm đều
 * ghi before/after + `changed_fields` + lý do.
 */

export interface AuditInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  changedFields: string[];
  reason?: string | null;
  requestId?: string | null;
  store?: DataStore;
}

/** Không bao giờ ghi các trường này vào audit (guideline 16.1). */
const REDACTED_FIELDS = new Set(['password', 'password_hash', 'secret', 'api_key', 'token']);

function redact(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return JSON.stringify(value);
  const clone: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : val;
  }
  return JSON.stringify(clone);
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const store = input.store ?? (await getStore());
  await store.insert('audit_logs', {
    id: randomUUID(),
    event_id: randomUUID(),
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    request_id: input.requestId ?? null,
    before_json: redact(input.before),
    after_json: redact(input.after),
    changed_fields: input.changedFields,
    reason: input.reason ?? null,
  });
}

export interface ActivityInput {
  actorUserId: string;
  entityType: string;
  entityId: string;
  verb: string;
  summary: string;
  store?: DataStore;
}

export async function recordActivity(input: ActivityInput): Promise<void> {
  const store = input.store ?? (await getStore());
  await store.insert('activity_events', {
    id: randomUUID(),
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_user_id: input.actorUserId,
    verb: input.verb,
    summary: input.summary,
  });
}

export interface OutboxInput {
  eventType: string;
  payload: unknown;
  store?: DataStore;
}

/**
 * Outbox — guideline 7.16. Việc phát sinh sau mutation (thông báo, tính lại nền, snapshot báo cáo)
 * được ghi cùng transaction rồi xử lý bất đồng bộ, để mutation không thất bại vì lỗi phụ.
 */
export async function enqueueOutbox(input: OutboxInput): Promise<void> {
  const store = input.store ?? (await getStore());
  await store.insert('outbox_events', {
    id: randomUUID(),
    event_type: input.eventType,
    payload_json: JSON.stringify(input.payload),
    status: 'PENDING',
    attempt_count: 0,
    next_attempt_at: new Date().toISOString(),
    processed_at: null,
    last_error: null,
  });
}

/** So sánh hai bản ghi, bỏ qua trường kỹ thuật — dùng cho `changed_fields`. */
const IGNORED_IN_DIFF = new Set(['updated_at', 'created_at', 'version', 'updated_by']);

export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
): string[] {
  if (!before) return Object.keys(after).filter((k) => !IGNORED_IN_DIFF.has(k));
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_IN_DIFF.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return changed;
}
