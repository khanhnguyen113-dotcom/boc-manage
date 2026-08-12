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

  it('không tính việc hủy/lưu trữ vào node đang hoạt động', () => {
    expect(kpi('active_nodes').value).toBe(4);
    expect(kpi('active_nodes').excluded_count).toBe(2);
  });

  it('đếm đúng quá hạn và sắp đến hạn', () => {
    expect(kpi('overdue').value).toBe(1);
    expect(kpi('near_due').value).toBe(1);
  });

  it('đếm P1 đang mở, không tính việc đã hoàn thành', () => {
    expect(kpi('p1_active').value).toBe(1);
  });

  it('hoàn thành trong kỳ theo ngày thực tế', () => {
    expect(kpi('completed_period').value).toBe(1);
  });

  it('tỷ lệ đúng hạn kèm mẫu số truy vết được', () => {
    const onTime = kpi('on_time_rate');
    expect(onTime.value).toBe(100);
    expect(onTime.eligible_count).toBe(1);
    expect(onTime.hint).toContain('Mẫu số = 1');
  });

  it('mọi KPI đều có link drill-down', () => {
    for (const k of snapshot.kpis) expect(k.drilldown.length).toBeGreaterThan(0);
  });

  it('tỷ lệ đúng hạn trả null khi không có việc hoàn thành nào — không hiện 0%', () => {
    const empty = computeControlTower(
      [makeWorkItem({ id: 'x' })],
      august,
      ctx,
      labels,
    );
    expect(empty.kpis.find((k) => k.key === 'on_time_rate')!.value).toBeNull();
  });
});

describe('nhịp deadline', () => {
  it('phân đúng nhóm', () => {
    const items = [
      makeWorkItem({ display_end: '2026-08-01' }), // quá hạn
      makeWorkItem({ display_end: '2026-08-14' }), // 0–7 ngày làm việc
      makeWorkItem({ display_end: '2026-09-10' }), // 8–30
      makeWorkItem({ display_end: '2026-12-31' }), // > 30
      makeWorkItem({ schedule_type: 'UNSCHEDULED', display_end: null }),
      makeWorkItem({ status: 'COMPLETED', completed_at: '2026-08-01' }),
    ];
    const buckets = computeDeadlineBuckets(items, ctx);
    expect(buckets.overdue).toBe(1);
    expect(buckets.due_0_7).toBe(1);
    expect(buckets.due_8_30).toBe(1);
    expect(buckets.due_over_30).toBe(1);
    expect(buckets.no_deadline).toBe(1);
    expect(buckets.completed).toBe(1);
  });
});

describe('xếp hạng việc cần can thiệp', () => {
  it('P1 quá hạn đứng trên P3 sắp đến hạn', () => {
    const items = [
      makeWorkItem({ id: 'nhe', priority: 'P3', display_end: '2026-08-17' }),
      makeWorkItem({ id: 'nang', priority: 'P1', display_end: '2026-08-03' }),
    ];
    const ranked = rankInterventions(items, ctx);
    expect(ranked[0].work_item_id).toBe('nang');
    expect(ranked[0].reasons.some((r) => r.includes('Quá hạn'))).toBe(true);
    expect(ranked[0].reasons).toContain('Ưu tiên P1');
  });

  it('điểm cuối chưa có người thực hiện cũng được nêu', () => {
    const items = [makeWorkItem({ primary_assignee_id: null, display_end: '2026-12-31' })];
    expect(rankInterventions(items, ctx)[0].reasons).toContain('Chưa có người thực hiện');
  });

  it('việc bình thường không xuất hiện trong danh sách can thiệp', () => {
    const items = [
      makeWorkItem({ priority: 'P3', display_end: '2026-12-31', data_quality_status: 'VALID' }),
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
