import { describe, expect, it } from 'vitest';

import {
  childBaselineWarnings,
  completedOnTime,
  computeDisplayDates,
  endBeforeStart,
  isOverdue,
} from '@/domain/dates';
import { buildTreeIndex } from '@/domain/hierarchy';
import { makeWorkItem } from '@/tests/factories';

describe('BR-DAT-002 · không có con thì hiển thị = kế hoạch gốc', () => {
  it('giữ nguyên planned', () => {
    const leaf = makeWorkItem({ planned_start: '2026-08-01', planned_end: '2026-08-20' });
    expect(computeDisplayDates(leaf, buildTreeIndex([leaf]))).toEqual({
      display_start: '2026-08-01',
      display_end: '2026-08-20',
    });
  });
});

describe('BR-DAT-003 · việc thường có con thì chỉ mở rộng, không thu hẹp', () => {
  const parent = makeWorkItem({
    id: 'p',
    level: 4,
    is_leaf: false,
    planned_start: '2026-08-10',
    planned_end: '2026-08-20',
  });

  it('con nằm gọn trong khung ⇒ giữ nguyên baseline', () => {
    const child = makeWorkItem({
      id: 'c',
      parent_id: 'p',
      display_start: '2026-08-12',
      display_end: '2026-08-15',
    });
    expect(computeDisplayDates(parent, buildTreeIndex([parent, child]))).toEqual({
      display_start: '2026-08-10',
      display_end: '2026-08-20',
    });
  });

  it('con bắt đầu sớm hơn và kết thúc muộn hơn ⇒ nới cả hai đầu', () => {
    const child = makeWorkItem({
      id: 'c',
      parent_id: 'p',
      display_start: '2026-08-05',
      display_end: '2026-09-30',
    });
    expect(computeDisplayDates(parent, buildTreeIndex([parent, child]))).toEqual({
      display_start: '2026-08-05',
      display_end: '2026-09-30',
    });
  });

  it('ngày kế hoạch gốc của cha không bị sửa (BR-DAT-001)', () => {
    const child = makeWorkItem({ id: 'c', parent_id: 'p', display_end: '2026-12-31' });
    computeDisplayDates(parent, buildTreeIndex([parent, child]));
    expect(parent.planned_end).toBe('2026-08-20');
  });
});

describe('BR-DAT-004 · việc phát sinh lấy hoàn toàn theo con', () => {
  it('AD_HOC có con ⇒ min/max của con, bỏ qua baseline', () => {
    const parent = makeWorkItem({
      id: 'p',
      level: 4,
      schedule_type: 'AD_HOC',
      is_leaf: false,
      planned_start: '2026-01-01',
      planned_end: '2026-12-31',
    });
    const kids = [
      makeWorkItem({ id: 'c1', parent_id: 'p', display_start: '2026-08-05', display_end: '2026-08-10' }),
      makeWorkItem({ id: 'c2', parent_id: 'p', display_start: '2026-08-08', display_end: '2026-08-20' }),
    ];
    expect(computeDisplayDates(parent, buildTreeIndex([parent, ...kids]))).toEqual({
      display_start: '2026-08-05',
      display_end: '2026-08-20',
    });
  });

  it('AD_HOC chưa có con ⇒ để trống theo rule nguồn', () => {
    const item = makeWorkItem({ schedule_type: 'AD_HOC', planned_start: null, planned_end: null });
    expect(computeDisplayDates(item, buildTreeIndex([item]))).toEqual({
      display_start: null,
      display_end: null,
    });
  });
});

describe('BR-DAT-005 · cảnh báo con vượt khung, không tự sửa', () => {
  it('cảnh báo cả hai đầu', () => {
    const parent = makeWorkItem({
      id: 'p',
      level: 4,
      is_leaf: false,
      planned_start: '2026-08-10',
      planned_end: '2026-08-20',
    });
    const child = makeWorkItem({
      id: 'c',
      code: 'HHL5DL01-01',
      parent_id: 'p',
      display_start: '2026-08-01',
      display_end: '2026-09-01',
    });
    const warnings = childBaselineWarnings(parent, buildTreeIndex([parent, child]));
    expect(warnings.map((w) => w.code)).toEqual([
      'CHILD_STARTS_BEFORE_PARENT',
      'CHILD_ENDS_AFTER_PARENT',
    ]);
    expect(warnings[0].related_code).toBe('HHL5DL01-01');
  });

  it('AD_HOC không cảnh báo vì baseline vốn theo con', () => {
    const parent = makeWorkItem({ id: 'p', level: 4, schedule_type: 'AD_HOC', is_leaf: false });
    const child = makeWorkItem({ id: 'c', parent_id: 'p', display_end: '2099-01-01' });
    expect(childBaselineWarnings(parent, buildTreeIndex([parent, child]))).toEqual([]);
  });
});

describe('BR-DAT-006 · ngày kết thúc trước ngày bắt đầu', () => {
  it('phát hiện đúng — ví dụ thật HHL5DL04-03 trong Sheet', () => {
    expect(endBeforeStart('2026-10-06', '2026-09-10')).toBe(true);
  });

  it('bằng nhau là hợp lệ', () => {
    expect(endBeforeStart('2026-08-05', '2026-08-05')).toBe(false);
  });

  it('thiếu một đầu thì không kết luận', () => {
    expect(endBeforeStart(null, '2026-08-05')).toBe(false);
  });
});

describe('quá hạn (guideline 8.6)', () => {
  const base = { schedule_type: 'DEADLINE' as const, display_end: '2026-08-10' };

  it('việc có thời hạn, chưa xong, hạn đã qua', () => {
    expect(isOverdue(makeWorkItem({ ...base }), '2026-08-12')).toBe(true);
  });

  it('đúng ngày hạn thì chưa quá hạn', () => {
    expect(isOverdue(makeWorkItem({ ...base }), '2026-08-10')).toBe(false);
  });

  it('đã hoàn thành hoặc đã hủy thì không quá hạn', () => {
    expect(isOverdue(makeWorkItem({ ...base, status: 'COMPLETED' }), '2026-08-12')).toBe(false);
    expect(isOverdue(makeWorkItem({ ...base, status: 'CANCELLED' }), '2026-08-12')).toBe(false);
  });

  it('việc không có thời hạn không bao giờ quá hạn', () => {
    const item = makeWorkItem({ schedule_type: 'UNSCHEDULED', display_end: null });
    expect(isOverdue(item, '2026-08-12')).toBe(false);
  });

  it('việc đã lưu trữ không tính quá hạn', () => {
    expect(isOverdue(makeWorkItem({ ...base, is_archived: true }), '2026-08-12')).toBe(false);
  });
});

describe('đúng hạn khi hoàn thành', () => {
  it('hoàn thành trước hoặc đúng hạn', () => {
    const item = makeWorkItem({ status: 'COMPLETED', display_end: '2026-08-10', completed_at: '2026-08-10' });
    expect(completedOnTime(item)).toBe(true);
  });

  it('hoàn thành sau hạn', () => {
    const item = makeWorkItem({ status: 'COMPLETED', display_end: '2026-08-10', completed_at: '2026-08-11' });
    expect(completedOnTime(item)).toBe(false);
  });

  it('thiếu hạn hoặc thiếu ngày thực tế ⇒ null, không vào mẫu số tỷ lệ đúng hạn', () => {
    const noDeadline = makeWorkItem({
      status: 'COMPLETED',
      display_end: null,
      planned_end: null,
      completed_at: '2026-08-10',
    });
    expect(completedOnTime(noDeadline)).toBeNull();
    expect(completedOnTime(makeWorkItem({ status: 'COMPLETED', completed_at: null }))).toBeNull();
  });

  it('thiếu display_end thì rơi về planned_end thay vì bỏ qua bản ghi', () => {
    const item = makeWorkItem({
      status: 'COMPLETED',
      display_end: null,
      planned_end: '2026-08-31',
      completed_at: '2026-08-10',
    });
    expect(completedOnTime(item)).toBe(true);
  });
});
