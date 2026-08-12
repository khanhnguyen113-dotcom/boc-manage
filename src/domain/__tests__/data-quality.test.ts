import { describe, expect, it } from 'vitest';

import { evaluateDataQuality, isInvalidCode, tallyDataQuality } from '@/domain/data-quality';
import { buildTreeIndex } from '@/domain/hierarchy';
import { makeWorkItem } from '@/tests/factories';

const treeOf = (...items: ReturnType<typeof makeWorkItem>[]) => buildTreeIndex(items);

describe('bản ghi hợp lệ', () => {
  it('không sinh mã lỗi', () => {
    const item = makeWorkItem({ level: 3, parent_id: null });
    const result = evaluateDataQuality(item, treeOf(item));
    expect(result.status).toBe('VALID');
    expect(result.codes).toEqual([]);
  });
});

describe('lỗi cấu trúc là INVALID', () => {
  it('L5 thiếu cha', () => {
    const item = makeWorkItem({ level: 5, parent_id: null });
    const result = evaluateDataQuality(item, treeOf(item));
    expect(result.codes).toContain('MISSING_PARENT');
    expect(result.status).toBe('INVALID');
  });

  it('tham chiếu cha không tồn tại — trường hợp #REF! của Sheet', () => {
    const item = makeWorkItem({ level: 5, parent_id: 'khong-ton-tai' });
    const result = evaluateDataQuality(item, treeOf(item));
    expect(result.codes).toContain('ORPHAN_REFERENCE');
    expect(result.status).toBe('INVALID');
  });

  it('cha sai cấp', () => {
    const parent = makeWorkItem({ id: 'p', level: 3 });
    const child = makeWorkItem({ id: 'c', level: 5, parent_id: 'p' });
    const result = evaluateDataQuality(child, treeOf(parent, child));
    expect(result.codes).toContain('INVALID_PARENT_LEVEL');
  });

  it('ngày kết thúc trước ngày bắt đầu', () => {
    const item = makeWorkItem({
      level: 3,
      parent_id: null,
      planned_start: '2026-10-06',
      planned_end: '2026-09-10',
    });
    const result = evaluateDataQuality(item, treeOf(item));
    expect(result.codes).toContain('END_BEFORE_START');
    expect(result.status).toBe('INVALID');
  });

  it('nhập tiến độ thủ công ở node có con', () => {
    const parent = makeWorkItem({ id: 'p', level: 4, manual_progress: 50 });
    const child = makeWorkItem({ id: 'c', level: 5, parent_id: 'p' });
    const result = evaluateDataQuality(parent, treeOf(parent, child));
    expect(result.codes).toContain('PROGRESS_ON_NON_LEAF');
  });
});

describe('thiếu dữ liệu là INCOMPLETE', () => {
  it('điểm cuối thiếu người thực hiện', () => {
    const item = makeWorkItem({ level: 3, parent_id: null, primary_assignee_id: null });
    const result = evaluateDataQuality(item, treeOf(item));
    expect(result.codes).toContain('MISSING_ASSIGNEE');
    expect(result.status).toBe('INCOMPLETE');
  });

  it('việc có thời hạn thiếu ngày', () => {
    const item = makeWorkItem({ level: 3, parent_id: null, planned_start: null, planned_end: null });
    expect(evaluateDataQuality(item, treeOf(item)).codes).toContain('MISSING_DATES');
  });

  it('điểm cuối thiếu tham số tải — “Thiếu tham số phân bổ” của Sheet', () => {
    const item = makeWorkItem({
      level: 3,
      parent_id: null,
      estimated_hours_input: null,
      allocation_unit: null,
      allocation_hours: null,
    });
    const codes = evaluateDataQuality(item, treeOf(item)).codes;
    expect(codes).toContain('MISSING_ESTIMATED_HOURS');
    expect(codes).toContain('MISSING_ALLOCATION');
  });

  it('việc chưa xếp lịch không bị đòi tham số tải', () => {
    const item = makeWorkItem({
      level: 3,
      parent_id: null,
      schedule_type: 'UNSCHEDULED',
      planned_start: null,
      planned_end: null,
      estimated_hours_input: null,
      allocation_unit: null,
      allocation_hours: null,
    });
    const codes = evaluateDataQuality(item, treeOf(item)).codes;
    expect(codes).not.toContain('MISSING_ESTIMATED_HOURS');
    expect(codes).not.toContain('MISSING_DATES');
  });

  it('node cha không bị đòi người thực hiện hay giờ', () => {
    const parent = makeWorkItem({
      id: 'p',
      level: 4,
      primary_assignee_id: null,
      manual_progress: null,
      estimated_hours_input: null,
      allocation_unit: null,
      allocation_hours: null,
    });
    const child = makeWorkItem({ id: 'c', level: 5, parent_id: 'p' });
    const codes = evaluateDataQuality(parent, treeOf(parent, child)).codes;
    expect(codes).not.toContain('MISSING_ASSIGNEE');
    expect(codes).not.toContain('MISSING_ESTIMATED_HOURS');
  });
});

describe('hoàn thành phải có bằng chứng', () => {
  const base = {
    level: 3 as const,
    parent_id: null,
    status: 'COMPLETED' as const,
    effective_progress: 100,
    completed_at: '2026-08-05',
  };

  it('thiếu bằng chứng kết quả — trường hợp HHL5RD05-01.03 trong Sheet', () => {
    const item = makeWorkItem({ ...base, result_link: null });
    expect(evaluateDataQuality(item, treeOf(item)).codes).toContain('MISSING_RESULT_EVIDENCE');
  });

  it('có tệp kết quả thì hợp lệ', () => {
    const item = makeWorkItem({ ...base, result_link: null });
    const result = evaluateDataQuality(item, treeOf(item), { hasResultAttachment: true });
    expect(result.codes).not.toContain('MISSING_RESULT_EVIDENCE');
  });

  it('hoàn thành nhưng tiến độ chưa đủ là INVALID', () => {
    const item = makeWorkItem({ ...base, effective_progress: 80, result_link: 'https://x' });
    const result = evaluateDataQuality(item, treeOf(item));
    expect(result.codes).toContain('COMPLETED_PROGRESS_NOT_100');
    expect(result.status).toBe('INVALID');
  });

  it('thiếu ngày hoàn thành thực tế', () => {
    const item = makeWorkItem({ ...base, completed_at: null, result_link: 'https://x' });
    expect(evaluateDataQuality(item, treeOf(item)).codes).toContain('MISSING_COMPLETED_AT');
  });
});

describe('việc đã hủy/lưu trữ không bị đòi dữ liệu vận hành', () => {
  it('bỏ qua kiểm tra chi tiết', () => {
    const item = makeWorkItem({
      level: 3,
      parent_id: null,
      status: 'CANCELLED',
      primary_assignee_id: null,
      estimated_hours_input: null,
      allocation_unit: null,
      allocation_hours: null,
    });
    expect(evaluateDataQuality(item, treeOf(item)).status).toBe('VALID');
  });
});

describe('phân loại mức nghiêm trọng', () => {
  it('mã chặn báo cáo được đánh dấu INVALID', () => {
    expect(isInvalidCode('END_BEFORE_START')).toBe(true);
    expect(isInvalidCode('ORPHAN_REFERENCE')).toBe(true);
    expect(isInvalidCode('MISSING_ASSIGNEE')).toBe(false);
  });
});

describe('tổng hợp Data Health', () => {
  it('đếm theo trạng thái và theo mã lỗi', () => {
    const items = [
      makeWorkItem({ data_quality_status: 'VALID', data_quality_codes: [] }),
      makeWorkItem({ data_quality_status: 'INCOMPLETE', data_quality_codes: ['MISSING_ASSIGNEE'] }),
      makeWorkItem({
        data_quality_status: 'INCOMPLETE',
        data_quality_codes: ['MISSING_ASSIGNEE', 'MISSING_DATES'],
      }),
      makeWorkItem({ data_quality_status: 'INVALID', data_quality_codes: ['END_BEFORE_START'] }),
    ];

    const tally = tallyDataQuality(items);
    expect(tally.valid).toBe(1);
    expect(tally.incomplete).toBe(2);
    expect(tally.invalid).toBe(1);
    expect(tally.by_code[0]).toMatchObject({ code: 'MISSING_ASSIGNEE', count: 2 });
    expect(tally.completeness).toBe(25);
  });

  it('tập rỗng trả completeness null', () => {
    expect(tallyDataQuality([]).completeness).toBeNull();
  });
});
