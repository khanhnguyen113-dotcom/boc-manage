import { describe, expect, it } from 'vitest';

import {
  evaluateOccurrenceDeadline,
  isOccurrenceDue,
  periodKey,
  periodRangeFor,
  requiresRecurrenceRule,
  requiresSkipReason,
  summarizeExecutionLogs,
} from '@/domain/execution';
import { makeExecutionLog, makeWorkItem } from '@/tests/factories';

describe('BR-REC-001 / BR-REC-005 · điều kiện bắt buộc', () => {
  it('việc định kỳ bắt buộc có chu kỳ', () => {
    expect(requiresRecurrenceRule({ schedule_type: 'RECURRING' })).toBe(true);
    expect(requiresRecurrenceRule({ schedule_type: 'DEADLINE' })).toBe(false);
  });

  it('bỏ qua một kỳ bắt buộc có lý do', () => {
    expect(requiresSkipReason('SKIPPED')).toBe(true);
    expect(requiresSkipReason('COMPLETED')).toBe(false);
  });
});

describe('khoảng kỳ và nhãn kỳ', () => {
  it('tuần', () => {
    expect(periodRangeFor('WEEK', '2026-08-12')).toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('tháng', () => {
    expect(periodRangeFor('MONTH', '2026-08-12')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('quý', () => {
    expect(periodRangeFor('QUARTER', '2026-08-12')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
  });

  it('năm', () => {
    expect(periodRangeFor('YEAR', '2026-08-12')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('nhãn kỳ dùng làm khóa chống trùng', () => {
    expect(periodKey('MONTH', '2026-08-12')).toBe('2026-08');
    expect(periodKey('QUARTER', '2026-08-12')).toBe('2026-Q3');
    expect(periodKey('YEAR', '2026-08-12')).toBe('2026');
    expect(periodKey('WEEK', '2026-08-12')).toMatch(/^2026-W\d{2}$/);
  });
});

describe('BR-REC-003 · đúng hạn của một kỳ', () => {
  it('hoàn thành trước hạn kỳ là đúng hạn', () => {
    const log = makeExecutionLog({ completed_at: '2026-08-14', occurrence_due_at: '2026-08-16' });
    expect(evaluateOccurrenceDeadline(log)).toBe('ON_TIME');
  });

  it('hoàn thành sau hạn kỳ là trễ', () => {
    const log = makeExecutionLog({ completed_at: '2026-08-18', occurrence_due_at: '2026-08-16' });
    expect(evaluateOccurrenceDeadline(log)).toBe('LATE');
  });

  it('không có hạn kỳ thì không tính vào tỷ lệ đúng hạn', () => {
    const log = makeExecutionLog({ occurrence_due_at: null });
    expect(evaluateOccurrenceDeadline(log)).toBe('NO_DEADLINE');
  });

  it('chưa hoàn thành thì chưa đánh giá', () => {
    expect(evaluateOccurrenceDeadline(makeExecutionLog({ status: 'IN_PROGRESS' }))).toBeNull();
  });
});

describe('BR-REC-004 · tổng hợp từ nhật ký, không suy từ giờ ước tính', () => {
  const range = { start: '2026-08-10', end: '2026-08-16' };

  it('cộng giờ thực tế và phân loại đúng hạn', () => {
    const logs = [
      makeExecutionLog({ actual_hours: 4, completed_at: '2026-08-12', occurrence_due_at: '2026-08-16' }),
      makeExecutionLog({ actual_hours: 2.5, completed_at: '2026-08-18', occurrence_due_at: '2026-08-16' }),
      makeExecutionLog({ status: 'IN_PROGRESS', actual_hours: 1, completed_at: null }),
      makeExecutionLog({ status: 'NOT_DONE', actual_hours: null, completed_at: null }),
      makeExecutionLog({ status: 'SKIPPED', actual_hours: null, completed_at: null, skip_reason: 'Khách hoãn' }),
    ];

    const summary = summarizeExecutionLogs(logs, range);
    expect(summary.completed).toBe(2);
    expect(summary.on_time).toBe(1);
    expect(summary.late).toBe(1);
    expect(summary.in_progress).toBe(1);
    expect(summary.not_done).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.actual_hours).toBe(7.5);
    expect(summary.on_time_rate).toBe(50);
    expect(summary.on_time_denominator).toBe(2);
  });

  it('mẫu số 0 ⇒ tỷ lệ null, KHÔNG phải 0% (guideline 11.2)', () => {
    const summary = summarizeExecutionLogs([makeExecutionLog({ status: 'NOT_DONE' })], range);
    expect(summary.on_time_rate).toBeNull();
    expect(summary.on_time_denominator).toBe(0);
  });

  it('bỏ qua log ngoài kỳ', () => {
    const logs = [makeExecutionLog({ period_start: '2026-07-01', completed_at: '2026-07-02' })];
    expect(summarizeExecutionLogs(logs, range).total).toBe(0);
  });

  it('kỳ bị bỏ qua không tính là hoàn thành', () => {
    const logs = [makeExecutionLog({ status: 'SKIPPED', completed_at: null })];
    const summary = summarizeExecutionLogs(logs, range);
    expect(summary.completed).toBe(0);
    expect(summary.skipped).toBe(1);
  });
});

describe('kỳ đến hạn chưa ghi nhật ký', () => {
  const item = makeWorkItem({ schedule_type: 'RECURRING', recurrence_rule: 'WEEK' });

  it('chưa có log trong tuần ⇒ đến kỳ', () => {
    expect(isOccurrenceDue(item, [], '2026-08-12')).toBe(true);
  });

  it('đã có log trong tuần ⇒ không đến kỳ', () => {
    const logs = [makeExecutionLog({ period_start: '2026-08-10', status: 'IN_PROGRESS' })];
    expect(isOccurrenceDue(item, logs, '2026-08-12')).toBe(false);
  });

  it('việc không định kỳ không bao giờ “đến kỳ”', () => {
    expect(isOccurrenceDue(makeWorkItem({ schedule_type: 'DEADLINE' }), [], '2026-08-12')).toBe(false);
  });
});
