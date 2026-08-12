import type { CompletionBlocker } from '@/domain/status';

/**
 * Lỗi nghiệp vụ có mã, để UI hiển thị đúng thông điệp tiếng Việt và test khẳng định được
 * bằng mã chứ không bằng chuỗi.
 */

export type MutationErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'INTERNAL';

export class MutationError extends Error {
  readonly code: MutationErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: MutationErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'MutationError';
    this.code = code;
    this.details = details;
  }
}

export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.') =>
  new MutationError('FORBIDDEN', message);

export const notFound = (message = 'Không tìm thấy dữ liệu.') =>
  new MutationError('NOT_FOUND', message);

export const validation = (message: string, details: Record<string, unknown> = {}) =>
  new MutationError('VALIDATION', message, details);

export const businessRule = (message: string, details: Record<string, unknown> = {}) =>
  new MutationError('BUSINESS_RULE', message, details);

/** ADR-006: bản ghi đã bị người khác sửa. */
export const conflict = (currentVersion: number) =>
  new MutationError(
    'CONFLICT',
    'Bản ghi đã được người khác cập nhật. Hãy tải lại để xem thay đổi mới nhất rồi thử lại.',
    { current_version: currentVersion },
  );

export const completionBlocked = (blockers: CompletionBlocker[]) =>
  new MutationError('BUSINESS_RULE', 'Chưa đủ điều kiện hoàn thành công việc.', {
    blockers: blockers.map((b) => ({ code: b.code, message: b.message })),
  });

export interface ActionFailure {
  ok: false;
  code: MutationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Kết quả trả về cho server action — không ném ra client. */
export type ActionResult<T = void> = { ok: true; data: T } | ActionFailure;

export function toActionResult(error: unknown): ActionFailure {
  if (error instanceof MutationError) {
    return { ok: false, code: error.code, message: error.message, details: error.details };
  }
  // Không rò rỉ stack/chi tiết hạ tầng ra client (guideline 16.1).
  console.error('[mutation] lỗi không mong đợi', error);
  return {
    ok: false,
    code: 'INTERNAL',
    message: 'Có lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị.',
  };
}
