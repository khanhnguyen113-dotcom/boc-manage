import { describe, expect, it } from 'vitest';

import { createCalendar, MASK_MON_SAT } from '@/domain/business-days';
import {
  computeControlTower,
  computeDeadlineBuckets,
  computePeriodReport,
  rankInterventions,
  type MetricsContext,
} from '@/domain/metrics';
import { makeExecutionLog, makeWorkItem } from '@/tests/factories';

const ctx: MetricsContext = {
  today: '2026-08-12',
  calendar: createCalendar(MASK_MON_SAT, ['2026-09-01', '2026-09-02']),
  progress: { categoryOf: () => 'STRATEGIC' },
  deadlineWarningDays: 7,
  categoryCodeOf: () => 'STRATEGIC',
  managementLevelCodeOf: () => 'COMPANY',
};

const labels = {
  unitName: (id: string) => id,
  userName: (id: string) => id,
  categoryName: (code: string) => code,
  managementLevelName: (code: string) => code,
};

const august = { start: '2026-08-01', end: '2026-08-31' };

describe('KPI Control Tower', () => {
  const items = [
    makeWorkItem({ id: 'a', priority: 'P1', display_end: '2026-08-05' }), // quá hạn
    makeWorkItem({ id: 'b', priority: 'P2', display_end: '2026-08-14' }), // sắp đến hạn
    makeWorkItem({ id: 'c', priority: 'P3', display_end: '2026-12-01' }), // còn xa
    makeWorkItem({
      id: 'd',
      status: 'COMPLETED',
      completed_at: '2026-08-10',
      display_end: '2026-08-12',
      effective_progress: 100,
    }),
    makeWorkItem({ id: 'e', status: 'CANCELLED' }),
    makeWorkItem({ id: 'f', is_archived: true }),
  ];

  const snapshot = computeControlTower(items, august, ctx, labels);
  const kpi = (key: string) => snapshot.kpis.find((k) => k.key === key)!;

  it('không tính việc hủy/lưu trữ vào tổng điểm cuối', () => {
    expect(kpi('active_leaves').value).toBe(4);
    expect(kpi('active_leaves').excluded_count).toBe(0);
  });

  it('đếm đúng quá hạn và các ngưỡng sắp đến hạn không chồng lặp', () => {
    expect(kpi('overdue').value).toBe(1);
    expect(kpi('due_1_2').value).toBe(1);
    expect(kpi('due_today').value).toBe(0);
    expect(kpi('due_3_7').value).toBe(0);
  });

  it('đếm riêng P1 và P2 đang mở, không tính việc đã hoàn thành', () => {
    expect(kpi('p1_active').value).toBe(1);
    expect(kpi('p2_active').value).toBe(1);
  });

  it('hoàn thành trong kỳ theo ngày thực tế', () => {
    expect(kpi('completed_period').value).toBe(1);
  });

  it('mọi KPI đều có link drill-down', () => {
    for (const k of snapshot.kpis) expect(k.drilldown.length).toBeGreaterThan(0);
  });

  it('chỉ trả tối đa 5 việc cần can thiệp và 5 link kết quả mới nhất', () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      makeWorkItem({
        id: `today-${index}`,
        display_end: '2026-08-12',
        result_link: `https://example.com/${index}`,
        updated_at: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const limited = computeControlTower(many, august, ctx, labels);
    expect(limited.interventions).toHaveLength(5);
    expect(limited.recent_results).toHaveLength(5);
    expect(limited.recent_results[0].work_item_id).toBe('today-6');
  });
});

describe('nhịp deadline', () => {
  it('phân đúng nhóm', () => {
    const items = [
      makeWorkItem({ display_end: '2026-08-01' }), // quá hạn
      makeWorkItem({ display_end: '2026-08-12' }), // hôm nay
      makeWorkItem({ display_end: '2026-08-14' }), // 1–2 ngày làm việc
      makeWorkItem({ display_end: '2026-08-17' }), // 3–7 ngày làm việc
      makeWorkItem({ display_end: '2026-09-10' }), // 8–30
      makeWorkItem({ display_end: '2026-12-31' }), // > 30
      makeWorkItem({ schedule_type: 'UNSCHEDULED', display_end: null }),
      makeWorkItem({ status: 'COMPLETED', completed_at: '2026-08-01' }),
    ];
    const buckets = computeDeadlineBuckets(items, ctx);
    expect(buckets.overdue).toBe(1);
    expect(buckets.due_today).toBe(1);
    expect(buckets.due_1_2).toBe(1);
    expect(buckets.due_3_7).toBe(1);
    expect(buckets.due_8_30).toBe(1);
    expect(buckets.due_over_30).toBe(1);
    expect(buckets.no_deadline).toBe(1);
    expect(buckets.completed).toBe(1);
  });
});

describe('xếp hạng việc cần can thiệp', () => {
  it('P1 quá hạn đứng trên P3 đến hạn hôm nay', () => {
    const items = [
      makeWorkItem({ id: 'nhe', priority: 'P3', display_end: '2026-08-12' }),
      makeWorkItem({ id: 'nang', priority: 'P1', display_end: '2026-08-03' }),
    ];
    const ranked = rankInterventions(items, ctx);
    expect(ranked[0].work_item_id).toBe('nang');
    expect(ranked[0].reasons.some((r) => r.includes('Quá hạn'))).toBe(true);
    expect(ranked[0].reasons).toContain('Ưu tiên P1');
  });

  it('việc đến hạn hôm nay chưa có người thực hiện vẫn được nêu', () => {
    const items = [makeWorkItem({ primary_assignee_id: null, display_end: '2026-08-12' })];
    expect(rankInterventions(items, ctx)[0].reasons).toContain('Chưa có người thực hiện');
  });

  it('việc chưa đến hạn hôm nay không xuất hiện dù thiếu dữ liệu hoặc người thực hiện', () => {
    const items = [
      makeWorkItem({ priority: 'P1', primary_assignee_id: null, display_end: '2026-12-31', data_quality_status: 'INVALID' }),
    ];
    expect(rankInterventions(items, ctx)).toEqual([]);
  });
});

describe('báo cáo kỳ', () => {
  it('tách đúng hạn/trễ theo từng lớp', () => {
    const items = [
      makeWorkItem({ level: 5, status: 'COMPLETED', completed_at: '2026-08-10', display_end: '2026-08-12' }),
      makeWorkItem({ level: 5, status: 'COMPLETED', completed_at: '2026-08-20', display_end: '2026-08-12' }),
      makeWorkItem({ level: 4, status: 'COMPLETED', completed_at: '2026-08-05', display_end: '2026-08-30' }),
    ];
    const report = computePeriodReport(items, [], august, ctx);
    const total = report.one_off[0];
    expect(total.completed).toBe(3);
    expect(total.on_time).toBe(2);
    expect(total.late).toBe(1);
    expect(total.on_time_rate).toBeCloseTo(66.7, 1);

    const l5 = report.one_off.find((r) => r.level === 5)!;
    expect(l5.completed).toBe(2);
    expect(l5.on_time).toBe(1);
  });

  it('đếm riêng việc hoàn thành thiếu ngày thực tế', () => {
    const items = [makeWorkItem({ status: 'COMPLETED', completed_at: null })];
    expect(computePeriodReport(items, [], august, ctx).totals.missing_completion_date).toBe(1);
  });

  it('không kết luận khi còn thiếu tham số tải', () => {
    const items = [
      makeWorkItem({ effective_estimated_hours: null, allocation_unit: null, allocation_hours: null }),
    ];
    const report = computePeriodReport(items, [], august, ctx);
    expect(report.conclusion.confident).toBe(false);
    expect(report.conclusion.missing_params).toBe(3);
    expect(report.conclusion.text).toContain('Chưa đủ dữ liệu');
  });

  it('kết luận được khi dữ liệu đủ', () => {
    const items = [
      makeWorkItem({
        status: 'COMPLETED',
        completed_at: '2026-08-10',
        display_end: '2026-08-12',
        effective_progress: 100,
      }),
    ];
    const report = computePeriodReport(items, [], august, ctx);
    expect(report.conclusion.confident).toBe(true);
    expect(report.conclusion.text).toContain('Hoàn thành 1 việc');
  });

  it('gộp số liệu định kỳ từ nhật ký', () => {
    const logs = [
      makeExecutionLog({ period_start: '2026-08-10', completed_at: '2026-08-12', occurrence_due_at: '2026-08-16', actual_hours: 3 }),
    ];
    const report = computePeriodReport([], logs, august, ctx);
    expect(report.recurring.completed).toBe(1);
    expect(report.recurring.actual_hours).toBe(3);
    expect(report.totals.actual_hours).toBe(3);
  });
});
