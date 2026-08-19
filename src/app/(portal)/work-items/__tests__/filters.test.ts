import { describe, expect, it } from 'vitest';

import { buildDerivedFilter, parseFilters } from '@/app/(portal)/work-items/filters';
import { createCalendar, MASK_MON_SAT } from '@/domain/business-days';
import { computeControlTower, type MetricsContext } from '@/domain/metrics';
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

  it('bỏ qua cấp dưới L3 nhưng chấp nhận lớp sâu hơn L6', () => {
    expect(parseFilters({ level: '2,9' }).query.level).toEqual([9]);
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

  it('tách riêng deadline hôm nay, 1–2 ngày và 3–7 ngày', () => {
    const today = filterFor({ warning: 'due_today' })!;
    const twoDays = filterFor({ warning: 'due_2' })!;
    const sevenDays = filterFor({ warning: 'due_7' })!;
    expect(today(makeWorkItem({ display_end: '2026-08-12' }))).toBe(true);
    expect(twoDays(makeWorkItem({ display_end: '2026-08-14' }))).toBe(true);
    expect(sevenDays(makeWorkItem({ display_end: '2026-08-17' }))).toBe(true);
    expect(twoDays(makeWorkItem({ display_end: '2026-08-17' }))).toBe(false);
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

/**
 * Nguyên tắc số liệu 3: mỗi KPI phải dẫn được về **đúng** danh sách bản ghi nguồn.
 *
 * Lỗi thật: KPI chỉ đếm việc có `schedule_type = DEADLINE` và lấy `display_end ?? planned_end`,
 * còn bộ lọc của `/work-items` tự tính lấy từ `display_end` cho **mọi** loại lịch. Kết quả là
 * thẻ “Sắp đến hạn trước 2 ngày” báo 6 nhưng bấm vào lại ra 7 dòng — sai kiểu âm thầm, không
 * có lỗi nào được ném ra.
 */
describe('KPI Control Tower và link drill-down phải ra cùng một tập bản ghi', () => {
  const metricsCtx: MetricsContext = {
    ...ctx,
    progress: { categoryOf: () => 'STRATEGIC' },
    categoryCodeOf: () => 'STRATEGIC',
    managementLevelCodeOf: () => 'COMPANY',
  };
  const labels = {
    unitName: (id: string) => id,
    userName: (id: string) => id,
    categoryName: (code: string) => code,
    managementLevelName: (code: string) => code,
  };

  const items = [
    makeWorkItem({ id: 'today', display_end: '2026-08-12' }),
    makeWorkItem({ id: 'two-days', display_end: '2026-08-14' }),
    makeWorkItem({ id: 'seven-days', display_end: '2026-08-17' }),
    makeWorkItem({ id: 'overdue', display_end: '2026-08-05' }),
    // Việc định kỳ có ngày kết thúc nhưng KHÔNG phải việc có thời hạn: KPI loại nó ra,
    // nên danh sách drill-down cũng phải loại.
    makeWorkItem({ id: 'recurring', schedule_type: 'RECURRING', display_end: '2026-08-14' }),
    makeWorkItem({ id: 'unscheduled', schedule_type: 'UNSCHEDULED', display_end: '2026-08-12' }),
    // Chưa có hạn hiển thị thì rơi về kế hoạch gốc — cả hai phía phải cùng rơi về.
    makeWorkItem({ id: 'baseline-only', display_end: null, planned_end: '2026-08-17' }),
  ];

  const snapshot = computeControlTower(items, { start: '2026-08-01', end: '2026-08-31' }, metricsCtx, labels);

  for (const key of ['due_today', 'due_1_2', 'due_3_7', 'overdue']) {
    it(`KPI ${key} khớp số dòng của chính link nó trỏ tới`, () => {
      const card = snapshot.kpis.find((k) => k.key === key)!;
      const params = Object.fromEntries(new URLSearchParams(card.drilldown ?? ''));
      const predicate = buildDerivedFilter(parseFilters(params), ctx);
      const matched = predicate ? items.filter(predicate) : items;
      expect(matched.length, `${key}: KPI ${card.value} vs danh sách ${matched.length}`).toBe(
        card.value,
      );
    });
  }

  it('việc không phải deadline không lọt vào danh sách sắp đến hạn', () => {
    const predicate = buildDerivedFilter(parseFilters({ warning: 'due_2' }), ctx)!;
    expect(items.filter(predicate).map((i) => i.id)).toEqual(['two-days']);
  });

  it('chưa có hạn hiển thị thì dùng kế hoạch gốc, giống KPI', () => {
    const predicate = buildDerivedFilter(parseFilters({ warning: 'due_7' }), ctx)!;
    expect(items.filter(predicate).map((i) => i.id)).toEqual(['seven-days', 'baseline-only']);
  });
});
