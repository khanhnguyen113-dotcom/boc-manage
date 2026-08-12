/** Fixture dùng chung cho unit test domain. Không dùng ở runtime. */

import type { ExecutionLog, WorkItem, WorkLevel } from '@/domain/types';

let counter = 0;

export function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  counter += 1;
  const id = overrides.id ?? `wi-${counter}`;
  const level = (overrides.level ?? 5) as WorkLevel;
  const code = overrides.code ?? `CODE-${counter}`;

  return {
    id,
    code,
    legacy_code: null,
    level,
    parent_id: null,
    root_id: overrides.root_id ?? id,
    path: `/${code}`,
    depth: level - 3,
    year: 2026,
    management_level_id: 'ml-company',
    category_id: 'cat-strategic',
    title: `Công việc ${counter}`,
    description: null,
    expected_output: 'Kết quả mong đợi',
    value_contribution: null,
    owning_unit_id: 'unit-dl',
    lead_user_id: 'user-lead',
    primary_assignee_id: 'user-assignee',
    status: 'IN_PROGRESS',
    priority: 'P2',
    schedule_type: 'DEADLINE',
    recurrence_rule: null,
    review_date: null,
    planned_start: '2026-08-01',
    planned_end: '2026-08-31',
    display_start: '2026-08-01',
    display_end: '2026-08-31',
    manual_progress: 0,
    effective_progress: 0,
    estimated_hours_input: 8,
    effective_estimated_hours: 8,
    is_leaf: true,
    data_quality_status: 'VALID',
    data_quality_codes: [],
    allocation_unit: 'DAY',
    allocation_hours: 2,
    completed_at: null,
    result_link: null,
    is_archived: false,
    archived_at: null,
    cancel_reason: null,
    created_by: 'user-creator',
    updated_by: 'user-creator',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

export function makeExecutionLog(overrides: Partial<ExecutionLog> = {}): ExecutionLog {
  counter += 1;
  return {
    id: `log-${counter}`,
    record_code: `LOG-${counter}`,
    work_item_id: 'wi-1',
    period_start: '2026-08-10',
    period_end: '2026-08-16',
    occurrence_due_at: '2026-08-16',
    status: 'COMPLETED',
    progress: 100,
    actual_hours: 4,
    deadline_result: null,
    note: null,
    skip_reason: null,
    result_link: null,
    responsible_user_id: 'user-assignee',
    completed_at: '2026-08-14',
    created_by: 'user-assignee',
    updated_by: 'user-assignee',
    created_at: '2026-08-14T00:00:00.000Z',
    updated_at: '2026-08-14T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

/** Cây 3 tầng: L3 → L4 → 2×L5, dùng cho test roll-up. */
export function makeSampleTree(): WorkItem[] {
  const l3 = makeWorkItem({
    id: 'l3',
    code: 'HHL3CT03',
    level: 3,
    root_id: 'l3',
    path: '/HHL3CT03',
    parent_id: null,
    is_leaf: false,
    manual_progress: null,
    estimated_hours_input: null,
  });
  const l4 = makeWorkItem({
    id: 'l4',
    code: 'HHL4DL01',
    level: 4,
    root_id: 'l3',
    parent_id: 'l3',
    path: '/HHL3CT03/HHL4DL01',
    is_leaf: false,
    manual_progress: null,
    estimated_hours_input: null,
  });
  const l5a = makeWorkItem({
    id: 'l5a',
    code: 'HHL5DL01-01',
    level: 5,
    root_id: 'l3',
    parent_id: 'l4',
    path: '/HHL3CT03/HHL4DL01/HHL5DL01-01',
    manual_progress: 40,
    effective_progress: 40,
    estimated_hours_input: 16,
    effective_estimated_hours: 16,
  });
  const l5b = makeWorkItem({
    id: 'l5b',
    code: 'HHL5DL01-02',
    level: 5,
    root_id: 'l3',
    parent_id: 'l4',
    path: '/HHL3CT03/HHL4DL01/HHL5DL01-02',
    manual_progress: 60,
    effective_progress: 60,
    estimated_hours_input: 4,
    effective_estimated_hours: 4,
  });
  return [l3, l4, l5a, l5b];
}
