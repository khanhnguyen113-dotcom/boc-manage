import { describe, expect, it } from 'vitest';

import { buildDerivedFilter, parseFilters } from '@/app/(portal)/work-items/filters';
import { createCalendar, MASK_MON_SAT } from '@/domain/business-days';
import { makeWorkItem } from '@/tests/factories';

/**
 * Bộ lọc phái sinh phải chạy TRƯỚC phân trang.
 *
 * Bài học từ lỗi thật: khi lọc “quá hạn” chạy sau phân trang, link drill-down từ Control Tower
 * trả về danh sách rỗng vì 5 bản ghi quá hạn không nằm trong 25 dòng đầu tiên.
 */

const ctx = {
  today: '2026-08-12',
  calendar: createCalendar(MASK_MON_SAT, ['2026-09-01', '2026-09-02']),
  deadlineWarningDays: 7,
};

const filterFor = (params: Record<string, string>) =>
  buildDerivedFilter(parseFilters(params), ctx);

describe('parseFilters', () => {
  it('tách preset trạng thái khỏi danh sách trạng thái cụ thể', () => {
    const parsed = parseFilters({ status: 'open' });
    expect(parsed.statusPreset).toBe('open');
    expect(parsed.query.status).toEqual([]);
  });

  it('đọc được nhiều giá trị phân tách bằng dấu phẩy', () => {
    expect(parseFilters({ level: '4,5' }).query.level).toEqual([4, 5]);
  });

  it('bỏ qua cấp không hợp lệ', () => {
    expect(parseFilters({ level: '9' }).query.level).toEqual([]);
  });

  it('mặc định sắp xếp theo mã, tăng dần', () => {
    expect(parseFilters({}).query.sort).toEqual([{ field: 'code', dir: 'asc' }]);
  });
});

describe('buildDerivedFilter', () => {
  it('không có bộ lọc phái sinh thì trả undefined', () => {
    expect(filterFor({})).toBeUndefined();
  });

  it('warning=overdue chỉ giữ việc có thời hạn đã trôi qua', () => {
    const predicate = filterFor({ warning: 'overdue' })!;
    expect(predicate(makeWorkItem({ display_end: '2026-08-01' }))).toBe(true);
    expect(predicate(makeWorkItem({ display_end: '2026-08-20' }))).toBe(false);
    expect(
      predicate(makeWorkItem({ display_end: '2026-08-01', status: 'COMPLETED' })),
    ).toBe(false);
  });

  it('warning=near_due dùng ngày làm việc, không phải ngày lịch', () => {
    const predicate = filterFor({ warning: 'near_due' })!;
    // 12/08 → 20/08 là 8 ngày lịch nhưng chỉ 8 ngày làm việc kể cả hai đầu ⇒ vượt ngưỡng 7.
    expect(predicate(makeWorkItem({ display_end: '2026-08-20' }))).toBe(false);
    expect(predicate(makeWorkItem({ display_end: '2026-08-15' }))).toBe(true);
  });

  it('warning=missing_assignee chỉ tính điểm cuối', () => {
    const predicate = filterFor({ warning: 'missing_assignee' })!;
    expect(predicate(makeWorkItem({ primary_assignee_id: null, is_leaf: true }))).toBe(true);
    expect(predicate(makeWorkItem({ primary_assignee_id: null, is_leaf: false }))).toBe(false);
  });

  it('quality lọc theo đúng mã lỗi', () => {
    const predicate = filterFor({ quality: 'MISSING_ALLOCATION' })!;
    expect(predicate(makeWorkItem({ data_quality_codes: ['MISSING_ALLOCATION'] }))).toBe(true);
    expect(predicate(makeWorkItem({ data_quality_codes: ['MISSING_ASSIGNEE'] }))).toBe(false);
  });

  it('kết hợp nhiều điều kiện bằng AND', () => {
    const predicate = filterFor({ status: 'open', warning: 'overdue' })!;
    expect(predicate(makeWorkItem({ display_end: '2026-08-01', status: 'IN_PROGRESS' }))).toBe(true);
    expect(predicate(makeWorkItem({ display_end: '2026-08-01', status: 'COMPLETED' }))).toBe(false);
  });
});
