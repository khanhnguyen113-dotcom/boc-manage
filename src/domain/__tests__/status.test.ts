import { describe, expect, it } from 'vitest';

import {
  canTransition,
  completionBlockers,
  isSensitiveTransition,
  statusWarnings,
  type CompletionInput,
} from '@/domain/status';
import { makeWorkItem } from '@/tests/factories';

const okCompletion: CompletionInput = {
  progress: 100,
  completed_at: '2026-08-12',
  expected_output: 'Báo cáo đã duyệt',
  result_link: 'https://drive.example.com/file',
  has_result_attachment: false,
  active_children_count: 0,
  active_children_incomplete_count: 0,
};

describe('bảng transition guideline 8.3', () => {
  it('cho phép các bước hợp lệ', () => {
    expect(canTransition('NOT_SCHEDULED', 'SCHEDULED')).toBe(true);
    expect(canTransition('SCHEDULED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransition('PAUSED', 'IN_PROGRESS')).toBe(true);
  });

  it('chặn nhảy cóc', () => {
    expect(canTransition('NOT_SCHEDULED', 'COMPLETED')).toBe(false);
    expect(canTransition('SCHEDULED', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('PAUSED', 'COMPLETED')).toBe(false);
  });

  it('giữ nguyên trạng thái luôn hợp lệ', () => {
    expect(canTransition('IN_PROGRESS', 'IN_PROGRESS')).toBe(true);
  });

  it('reopen và restore là thao tác nhạy cảm', () => {
    expect(isSensitiveTransition('COMPLETED', 'IN_PROGRESS')).toBe(true);
    expect(isSensitiveTransition('CANCELLED', 'NOT_SCHEDULED')).toBe(true);
    expect(isSensitiveTransition('IN_PROGRESS', 'PAUSED')).toBe(false);
  });
});

describe('BR-STA-001 · điều kiện hoàn thành', () => {
  it('đủ điều kiện thì không có rào cản', () => {
    expect(completionBlockers(okCompletion)).toEqual([]);
  });

  it('chặn khi tiến độ chưa 100%', () => {
    const blockers = completionBlockers({ ...okCompletion, progress: 90 });
    expect(blockers.map((b) => b.code)).toContain('PROGRESS_NOT_100');
  });

  it('chặn khi thiếu ngày hoàn thành thực tế', () => {
    expect(completionBlockers({ ...okCompletion, completed_at: null }).map((b) => b.code)).toContain(
      'MISSING_COMPLETED_AT',
    );
  });

  it('chặn khi thiếu kết quả đầu ra', () => {
    expect(
      completionBlockers({ ...okCompletion, expected_output: '   ' }).map((b) => b.code),
    ).toContain('MISSING_EXPECTED_OUTPUT');
  });

  it('chặn khi không có bằng chứng kết quả', () => {
    const blockers = completionBlockers({
      ...okCompletion,
      result_link: null,
      has_result_attachment: false,
    });
    expect(blockers.map((b) => b.code)).toContain('MISSING_RESULT_EVIDENCE');
  });

  it('tệp kết quả thay được cho link', () => {
    const blockers = completionBlockers({
      ...okCompletion,
      result_link: null,
      has_result_attachment: true,
    });
    expect(blockers).toEqual([]);
  });
});

describe('công việc cha không hoàn thành thủ công (ADR / NEED_CONFIRMATION C3)', () => {
  it('chặn ngay khi còn con hoạt động', () => {
    const blockers = completionBlockers({
      ...okCompletion,
      active_children_count: 2,
      active_children_incomplete_count: 1,
    });
    expect(blockers.map((b) => b.code)).toEqual(['HAS_ACTIVE_CHILDREN', 'ACTIVE_CHILDREN_NOT_DONE']);
  });
});

describe('cảnh báo trạng thái không nhất quán', () => {
  const today = '2026-08-12';

  it('BR-STA-002 · có ngày hoàn thành nhưng trạng thái khác', () => {
    const item = makeWorkItem({ status: 'IN_PROGRESS', completed_at: '2026-08-01' });
    expect(statusWarnings(item, today).map((w) => w.code)).toContain(
      'COMPLETED_AT_WITHOUT_COMPLETED_STATUS',
    );
  });

  it('BR-STA-003 · tiến độ 100% nhưng chưa hoàn thành', () => {
    const item = makeWorkItem({ status: 'IN_PROGRESS', effective_progress: 100 });
    expect(statusWarnings(item, today).map((w) => w.code)).toContain('PROGRESS_100_NOT_COMPLETED');
  });

  it('BR-STA-005 · chưa lên lịch nhưng đã có ngày', () => {
    const item = makeWorkItem({ status: 'NOT_SCHEDULED', planned_start: '2026-09-01' });
    expect(statusWarnings(item, today).map((w) => w.code)).toContain('NOT_SCHEDULED_HAS_DATES');
  });

  it('BR-STA-006 · đến ngày bắt đầu mà vẫn Đã lên lịch', () => {
    const item = makeWorkItem({ status: 'SCHEDULED', planned_start: '2026-08-01' });
    expect(statusWarnings(item, today).map((w) => w.code)).toContain('SCHEDULED_PAST_START');
  });

  it('BR-STA-007 · quá hạn nhưng chưa bắt đầu — trường hợp HHL4DL08 trong Sheet', () => {
    const item = makeWorkItem({
      status: 'NOT_STARTED',
      planned_start: '2026-07-29',
      planned_end: '2026-08-02',
    });
    const warnings = statusWarnings(item, today);
    expect(warnings.map((w) => w.code)).toContain('NOT_STARTED_PAST_END');
    expect(warnings.find((w) => w.code === 'NOT_STARTED_PAST_END')?.severity).toBe('error');
  });

  it('bản ghi sạch không sinh cảnh báo', () => {
    const item = makeWorkItem({ status: 'IN_PROGRESS', effective_progress: 40 });
    expect(statusWarnings(item, today)).toEqual([]);
  });
});
