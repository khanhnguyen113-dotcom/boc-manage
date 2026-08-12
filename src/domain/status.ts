/**
 * Chuyển trạng thái và điều kiện hoàn thành — BR-STA-001…008.
 *
 * Bảng transition lấy nguyên văn từ guideline 8.3.
 */

import type { WorkItem, WorkStatus } from './types';

export const STATUS_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  NOT_SCHEDULED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['NOT_STARTED', 'IN_PROGRESS', 'CANCELLED'],
  NOT_STARTED: ['IN_PROGRESS', 'PAUSED', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'], // reopen — cần quyền + lý do (BR-STA-008)
  CANCELLED: ['NOT_SCHEDULED'], // restore — cần quyền + lý do
};

/** Chuyển trạng thái cần quyền cao + lý do bắt buộc. */
export const SENSITIVE_TRANSITIONS: ReadonlyArray<{ from: WorkStatus; to: WorkStatus }> = [
  { from: 'COMPLETED', to: 'IN_PROGRESS' },
  { from: 'CANCELLED', to: 'NOT_SCHEDULED' },
];

export function canTransition(from: WorkStatus, to: WorkStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}

export function isSensitiveTransition(from: WorkStatus, to: WorkStatus): boolean {
  return SENSITIVE_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function allowedNextStatuses(from: WorkStatus): WorkStatus[] {
  return STATUS_TRANSITIONS[from];
}

// ---------------------------------------------------------------------------
// Điều kiện hoàn thành — BR-STA-001
// ---------------------------------------------------------------------------

export type CompletionBlockerCode =
  | 'PROGRESS_NOT_100'
  | 'MISSING_COMPLETED_AT'
  | 'MISSING_EXPECTED_OUTPUT'
  | 'MISSING_RESULT_EVIDENCE'
  | 'HAS_ACTIVE_CHILDREN'
  | 'ACTIVE_CHILDREN_NOT_DONE';

export interface CompletionBlocker {
  code: CompletionBlockerCode;
  message: string;
}

export interface CompletionInput {
  progress: number | null;
  completed_at: string | null;
  expected_output: string | null;
  result_link: string | null;
  has_result_attachment: boolean;
  /** Số con còn hoạt động — cha không được complete thủ công (ADR-C3). */
  active_children_count: number;
  active_children_incomplete_count: number;
}

/**
 * Trả về danh sách rào cản. Rỗng = được phép hoàn thành.
 *
 * Ngoại lệ (`exemption`) chỉ dành cho người có `work.complete` + quyền quản lý và **bắt buộc**
 * kèm lý do; lý do được ghi audit ở tầng service, không xử lý ở đây.
 */
export function completionBlockers(input: CompletionInput): CompletionBlocker[] {
  const blockers: CompletionBlocker[] = [];

  if (input.active_children_count > 0) {
    blockers.push({
      code: 'HAS_ACTIVE_CHILDREN',
      message:
        'Công việc cha không được hoàn thành thủ công — tiến độ được tính từ các công việc con.',
    });
    if (input.active_children_incomplete_count > 0) {
      blockers.push({
        code: 'ACTIVE_CHILDREN_NOT_DONE',
        message: `Còn ${input.active_children_incomplete_count} công việc con chưa hoàn thành.`,
      });
    }
    return blockers;
  }

  if (input.progress === null || input.progress < 100) {
    blockers.push({ code: 'PROGRESS_NOT_100', message: 'Tiến độ phải đạt 100%.' });
  }
  if (!input.completed_at) {
    blockers.push({ code: 'MISSING_COMPLETED_AT', message: 'Phải nhập ngày hoàn thành thực tế.' });
  }
  if (!input.expected_output?.trim()) {
    blockers.push({
      code: 'MISSING_EXPECTED_OUTPUT',
      message: 'Phải mô tả kết quả đầu ra trước khi hoàn thành.',
    });
  }
  if (!input.result_link?.trim() && !input.has_result_attachment) {
    blockers.push({
      code: 'MISSING_RESULT_EVIDENCE',
      message: 'Phải có link kết quả hoặc tệp kết quả làm bằng chứng.',
    });
  }

  return blockers;
}

// ---------------------------------------------------------------------------
// Cảnh báo trạng thái không nhất quán — BR-STA-002/003/005/006/007
// ---------------------------------------------------------------------------

export type StatusWarningCode =
  | 'COMPLETED_AT_WITHOUT_COMPLETED_STATUS'
  | 'PROGRESS_100_NOT_COMPLETED'
  | 'NOT_SCHEDULED_HAS_DATES'
  | 'SCHEDULED_PAST_START'
  | 'NOT_STARTED_PAST_END';

export interface StatusWarning {
  code: StatusWarningCode;
  message: string;
  severity: 'warning' | 'error';
}

export function statusWarnings(item: WorkItem, today: string): StatusWarning[] {
  const out: StatusWarning[] = [];

  // BR-STA-002
  if (item.completed_at && item.status !== 'COMPLETED') {
    out.push({
      code: 'COMPLETED_AT_WITHOUT_COMPLETED_STATUS',
      message: 'Có ngày hoàn thành thực tế nhưng trạng thái chưa phải Hoàn thành.',
      severity: 'error',
    });
  }

  // BR-STA-003
  if (
    item.effective_progress === 100 &&
    item.status !== 'COMPLETED' &&
    item.status !== 'CANCELLED'
  ) {
    out.push({
      code: 'PROGRESS_100_NOT_COMPLETED',
      message: 'Tiến độ 100% nhưng chưa chuyển sang Hoàn thành.',
      severity: 'warning',
    });
  }

  // BR-STA-005
  if (item.status === 'NOT_SCHEDULED' && (item.planned_start || item.planned_end)) {
    out.push({
      code: 'NOT_SCHEDULED_HAS_DATES',
      message: 'Trạng thái Chưa lên lịch nhưng đã có ngày kế hoạch — cần chuyển Đã lên lịch.',
      severity: 'warning',
    });
  }

  // BR-STA-006
  if (item.status === 'SCHEDULED' && item.planned_start && item.planned_start <= today) {
    out.push({
      code: 'SCHEDULED_PAST_START',
      message: 'Đã đến ngày bắt đầu nhưng công việc vẫn ở trạng thái Đã lên lịch.',
      severity: 'warning',
    });
  }

  // BR-STA-007
  if (item.status === 'NOT_STARTED' && item.planned_end && item.planned_end < today) {
    out.push({
      code: 'NOT_STARTED_PAST_END',
      message: 'Đã qua hạn kết thúc nhưng công việc chưa bắt đầu.',
      severity: 'error',
    });
  }

  return out;
}
