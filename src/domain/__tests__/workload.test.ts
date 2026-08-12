import { describe, expect, it } from 'vitest';

import { createCalendar, MASK_MON_SAT } from '@/domain/business-days';
import {
  classifyLoad,
  computeItemLoad,
  computePersonLoad,
  DEFAULT_CAPACITY,
  loadDataGaps,
  resolveCapacity,
  toDailyLoad,
} from '@/domain/workload';
import { makeWorkItem } from '@/tests/factories';

const cal = createCalendar(MASK_MON_SAT, ['2026-09-01', '2026-09-02']);
const config = DEFAULT_CAPACITY;

describe('BR-LOD-002 · quy đổi phân bổ về giờ/ngày', () => {
  it('đơn vị Ngày dùng thẳng', () => {
    expect(toDailyLoad(3, 'DAY', config)).toBe(3);
  });

  it('đơn vị Tuần chia capacityDaysPerWeek (Sheet dùng 5)', () => {
    expect(toDailyLoad(20, 'WEEK', config)).toBe(4);
  });

  it('trả null khi thiếu đơn vị hoặc giờ ≤ 0 — không mặc định 0', () => {
    expect(toDailyLoad(5, null, config)).toBeNull();
    expect(toDailyLoad(0, 'DAY', config)).toBeNull();
    expect(toDailyLoad(null, 'DAY', config)).toBeNull();
  });
});

describe('BR-LOD-004 · thiếu tham số ⇒ không kết luận', () => {
  it('liệt kê đúng tham số thiếu', () => {
    const item = makeWorkItem({
      effective_estimated_hours: null,
      allocation_unit: null,
      allocation_hours: null,
    });
    expect(loadDataGaps(item)).toEqual([
      'MISSING_ESTIMATED_HOURS',
      'MISSING_ALLOCATION_UNIT',
      'MISSING_ALLOCATION_HOURS',
    ]);
  });

  it('bản ghi đủ tham số không có gap', () => {
    expect(loadDataGaps(makeWorkItem())).toEqual([]);
  });

  it('phân bổ ≤ 0 là dữ liệu sai chứ không phải thiếu', () => {
    expect(loadDataGaps(makeWorkItem({ allocation_hours: 0 }))).toEqual(['ALLOCATION_NON_POSITIVE']);
  });
});

describe('BR-LOD-003 · giờ/ngày cần thiết để kịp hạn', () => {
  it('giờ còn lại chia số ngày làm việc còn lại', () => {
    const item = makeWorkItem({
      effective_estimated_hours: 12,
      effective_progress: 0,
      display_end: '2026-08-08', // Hai 03/08 → Bảy 08/08 = 6 ngày làm việc
    });
    const load = computeItemLoad(item, '2026-08-03', cal, config);
    expect(load.remaining_business_days).toBe(6);
    expect(load.required_daily).toBe(2);
  });

  it('quá hạn ⇒ 0 ngày còn lại, vẫn tính required theo mẫu số tối thiểu 1', () => {
    const item = makeWorkItem({
      effective_estimated_hours: 10,
      effective_progress: 50,
      display_end: '2026-08-01',
    });
    const load = computeItemLoad(item, '2026-08-12', cal, config);
    expect(load.remaining_business_days).toBe(0);
    expect(load.required_daily).toBe(5);
  });
});

describe('ngưỡng tải', () => {
  it('theo Sheet: ≤85% bình thường · 85–100% cận tải · >100% quá tải', () => {
    expect(classifyLoad(0.5, config)).toBe('NORMAL');
    expect(classifyLoad(0.84, config)).toBe('NORMAL');
    expect(classifyLoad(0.85, config)).toBe('NEAR_CAPACITY');
    expect(classifyLoad(1, config)).toBe('NEAR_CAPACITY');
    expect(classifyLoad(1.01, config)).toBe('OVER_CAPACITY');
  });

  it('đổi ngưỡng sang 80% chỉ cần đổi cấu hình (NEED_CONFIRMATION B4)', () => {
    const alt = { ...config, nearCapacityThreshold: 0.8 };
    expect(classifyLoad(0.82, alt)).toBe('NEAR_CAPACITY');
    expect(classifyLoad(0.82, config)).toBe('NORMAL');
  });
});

describe('BR-LOD-006 · công suất cá nhân → đơn vị → hệ thống', () => {
  it('ưu tiên override cá nhân', () => {
    expect(resolveCapacity(6, 7, config)).toBe(6);
  });

  it('rơi về đơn vị rồi mặc định', () => {
    expect(resolveCapacity(null, 7, config)).toBe(7);
    expect(resolveCapacity(null, null, config)).toBe(8);
  });
});

describe('BR-LOD-005 · tải theo người', () => {
  const range = { start: '2026-08-10', end: '2026-08-16' };

  it('chỉ cộng việc lá đang chạy có giao khoảng đánh giá', () => {
    const items = [
      makeWorkItem({ allocation_hours: 2, allocation_unit: 'DAY', display_start: '2026-08-01', display_end: '2026-08-31' }),
      makeWorkItem({ allocation_hours: 3, allocation_unit: 'DAY', display_start: '2026-08-12', display_end: '2026-08-14' }),
      // Nằm ngoài khoảng ⇒ không tính.
      makeWorkItem({ allocation_hours: 8, allocation_unit: 'DAY', display_start: '2026-09-01', display_end: '2026-09-10' }),
      // Không phải leaf ⇒ không tính, tránh double-count với con.
      makeWorkItem({ allocation_hours: 8, allocation_unit: 'DAY', is_leaf: false }),
      // Đã hoàn thành ⇒ không tính.
      makeWorkItem({ allocation_hours: 8, allocation_unit: 'DAY', status: 'COMPLETED' }),
    ];

    const load = computePersonLoad(
      { user_id: 'u1', capacityHoursPerDay: 8, items },
      range,
      '2026-08-12',
      cal,
      config,
    );

    expect(load.item_count).toBe(2);
    expect(load.planned_daily).toBe(5);
    expect(load.utilization).toBeCloseTo(0.625, 3);
    expect(load.state).toBe('NORMAL');
  });

  it('quá tải khi vượt 100% công suất', () => {
    const items = [
      makeWorkItem({ allocation_hours: 6, allocation_unit: 'DAY' }),
      makeWorkItem({ allocation_hours: 4, allocation_unit: 'DAY' }),
    ];
    const load = computePersonLoad(
      { user_id: 'u1', capacityHoursPerDay: 8, items },
      range,
      '2026-08-12',
      cal,
      config,
    );
    expect(load.planned_daily).toBe(10);
    expect(load.state).toBe('OVER_CAPACITY');
  });

  it('một việc thiếu tham số là đủ để KHÔNG kết luận mức tải', () => {
    const items = [
      makeWorkItem({ allocation_hours: 2, allocation_unit: 'DAY' }),
      makeWorkItem({ allocation_hours: null, allocation_unit: null }),
    ];
    const load = computePersonLoad(
      { user_id: 'u1', capacityHoursPerDay: 8, items },
      range,
      '2026-08-12',
      cal,
      config,
    );
    expect(load.state).toBe('INSUFFICIENT_DATA');
    expect(load.items_with_gaps).toBe(1);
  });

  it('không có việc nào trong kỳ cũng là chưa đủ dữ liệu, không phải “nhàn”', () => {
    const load = computePersonLoad(
      { user_id: 'u1', capacityHoursPerDay: 8, items: [] },
      range,
      '2026-08-12',
      cal,
      config,
    );
    expect(load.state).toBe('INSUFFICIENT_DATA');
  });

  it('cộng giờ tồn của việc đã quá hạn', () => {
    const items = [
      makeWorkItem({
        allocation_hours: 2,
        allocation_unit: 'DAY',
        display_start: '2026-08-01',
        display_end: '2026-08-11',
        effective_estimated_hours: 10,
        effective_progress: 20,
      }),
    ];
    const load = computePersonLoad(
      { user_id: 'u1', capacityHoursPerDay: 8, items },
      range,
      '2026-08-12',
      cal,
      config,
    );
    expect(load.overdue_remaining_hours).toBe(8);
  });
});
