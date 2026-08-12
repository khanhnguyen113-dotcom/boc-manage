/**
 * Định nghĩa chỉ số dùng chung cho Control Tower, báo cáo và export — guideline mục 10 & 11.
 *
 * Ba nguyên tắc bất di bất dịch:
 * 1. **Một định nghĩa duy nhất.** UI, XLSX, CSV, PDF đều gọi hàm ở file này.
 * 2. **Mọi KPI đều truy vết được.** Trả kèm `eligible_count`, `excluded_count`,
 *    `exclusion_reasons` và bộ filter để drill-down ra đúng danh sách record.
 * 3. **Không kết luận trên dữ liệu thiếu.** Mẫu số = 0 ⇒ `value = null` (UI hiện “—”),
 *    tuyệt đối không hiển thị 0%.
 */

import {
  businessDaysLeft,
  isWithin,
  type BusinessCalendar,
  type DateRange,
} from './business-days';
import { CLOSED_STATUSES } from './catalogs';
import { completedOnTime, isOverdue } from './dates';
import { summarizeExecutionLogs, type ExecutionSummary } from './execution';
import { averageProgress, remainingHours, type ProgressContext } from './progress';
import { tallyDataQuality } from './data-quality';
import type {
  BusinessDate,
  CategoryCode,
  ExecutionLog,
  ManagementLevelCode,
  Priority,
  WorkItem,
  WorkLevel,
  WorkStatus,
} from './types';

export interface Kpi {
  key: string;
  label: string;
  /** `null` = chưa đủ dữ liệu để kết luận. */
  value: number | null;
  format: 'count' | 'percent' | 'hours';
  eligible_count: number;
  excluded_count: number;
  exclusion_reasons: string[];
  /** Query string để drill-down ra danh sách record nguồn (ADR-014). */
  drilldown: string;
  hint: string;
}

export interface MetricsContext {
  today: BusinessDate;
  calendar: BusinessCalendar;
  progress: ProgressContext;
  /** Ngưỡng “sắp đến hạn”, tính bằng ngày làm việc (NEED_CONFIRMATION B5). */
  deadlineWarningDays: number;
  categoryCodeOf: (item: WorkItem) => CategoryCode | null;
  managementLevelCodeOf: (item: WorkItem) => ManagementLevelCode | null;
}

// ---------------------------------------------------------------------------
// Bộ lọc cơ bản
// ---------------------------------------------------------------------------

/** Node “active”: không lưu trữ, không hủy. Dùng làm mẫu số của hầu hết KPI. */
export function isActive(item: WorkItem): boolean {
  return !item.is_archived && item.status !== 'CANCELLED';
}

export function isActiveLeaf(item: WorkItem): boolean {
  return isActive(item) && item.is_leaf;
}

export function isOpen(item: WorkItem): boolean {
  return isActive(item) && !CLOSED_STATUSES.includes(item.status);
}

// ---------------------------------------------------------------------------
// Control Tower
// ---------------------------------------------------------------------------

export interface DeadlineBuckets {
  overdue: number;
  due_0_7: number;
  due_8_30: number;
  due_over_30: number;
  no_deadline: number;
  completed: number;
}

export interface Breakdown {
  key: string;
  label: string;
  total: number;
  completed: number;
  overdue: number;
  progress: number | null;
  progress_eligible: number;
}

export interface InterventionItem {
  work_item_id: string;
  code: string;
  title: string;
  level: WorkLevel;
  status: WorkStatus;
  priority: Priority | null;
  assignee_id: string | null;
  owning_unit_id: string;
  display_end: BusinessDate | null;
  days_left: number | null;
  progress: number | null;
  /** Điểm ưu tiên can thiệp, cao = cần xử lý trước. */
  score: number;
  reasons: string[];
}

export interface ControlTowerSnapshot {
  generated_at: string;
  business_date: BusinessDate;
  kpis: Kpi[];
  deadline_buckets: DeadlineBuckets;
  /** Ma trận khẩn cấp × quan trọng. */
  matrix: { p1_overdue: number; p1_near: number; p1_on_track: number; other_overdue: number };
  interventions: InterventionItem[];
  by_management_level: Breakdown[];
  by_category: Breakdown[];
  by_unit: Breakdown[];
  by_assignee: Breakdown[];
  data_health: ReturnType<typeof tallyDataQuality>;
}

export function computeControlTower(
  items: readonly WorkItem[],
  period: DateRange,
  ctx: MetricsContext,
  labels: {
    unitName: (id: string) => string;
    userName: (id: string) => string;
    categoryName: (code: CategoryCode) => string;
    managementLevelName: (code: ManagementLevelCode) => string;
  },
): ControlTowerSnapshot {
  const active = items.filter(isActive);
  const activeLeaves = active.filter((i) => i.is_leaf);
  const open = active.filter(isOpen);

  const overdue = open.filter((i) => isOverdue(i, ctx.today));

  const nearDue = open.filter((i) => {
    if (i.schedule_type !== 'DEADLINE') return false;
    const left = businessDaysLeft(ctx.today, i.display_end ?? i.planned_end, ctx.calendar);
    return left !== null && left >= 0 && left <= ctx.deadlineWarningDays;
  });

  const completedInPeriod = items.filter(
    (i) => i.status === 'COMPLETED' && isWithin(i.completed_at, period),
  );

  const onTimeEvaluable = completedInPeriod
    .map((i) => ({ item: i, onTime: completedOnTime(i) }))
    .filter((r): r is { item: WorkItem; onTime: boolean } => r.onTime !== null);
  const onTimeCount = onTimeEvaluable.filter((r) => r.onTime).length;

  const progressResult = averageProgress(activeLeaves, ctx.progress);

  const remaining = activeLeaves.reduce((sum, item) => {
    const h = remainingHours(item);
    return h === null ? sum : sum + h;
  }, 0);
  const remainingEligible = activeLeaves.filter((i) => remainingHours(i) !== null).length;

  const health = tallyDataQuality(active);

  const kpis: Kpi[] = [
    kpi('active_nodes', 'Công việc đang hoạt động', active.length, 'count', {
      eligible: active.length,
      excluded: items.length - active.length,
      reasons: ['Đã hủy hoặc lưu trữ'],
      drilldown: 'status=active',
      hint: 'Toàn bộ node L3–L6 chưa hủy, chưa lưu trữ.',
    }),
    kpi('active_leaves', 'Điểm cuối đang hoạt động', activeLeaves.length, 'count', {
      eligible: activeLeaves.length,
      excluded: active.length - activeLeaves.length,
      reasons: ['Node có công việc con'],
      drilldown: 'status=active&leaf=1',
      hint: 'Node không còn công việc con — nơi duy nhất nhập tiến độ và giờ.',
    }),
    kpi('p1_active', 'P1 đang mở', open.filter((i) => i.priority === 'P1').length, 'count', {
      eligible: open.length,
      excluded: 0,
      reasons: [],
      drilldown: 'priority=P1&status=open',
      hint: 'Ưu tiên trọng yếu chưa hoàn thành/chưa hủy.',
    }),
    kpi('overdue', 'Quá hạn', overdue.length, 'count', {
      eligible: open.filter((i) => i.schedule_type === 'DEADLINE').length,
      excluded: open.filter((i) => i.schedule_type !== 'DEADLINE').length,
      reasons: ['Không phải việc có thời hạn'],
      drilldown: 'warning=overdue',
      hint: `Hạn hiển thị trước ngày nghiệp vụ ${ctx.today}, chưa hoàn thành.`,
    }),
    kpi('near_due', `Đến hạn trong ${ctx.deadlineWarningDays} ngày làm việc`, nearDue.length, 'count', {
      eligible: open.filter((i) => i.schedule_type === 'DEADLINE').length,
      excluded: open.filter((i) => i.schedule_type !== 'DEADLINE').length,
      reasons: ['Không phải việc có thời hạn'],
      drilldown: 'warning=near_due',
      hint: 'Tính theo ngày làm việc, đã loại Chủ nhật và ngày nghỉ đã khai báo.',
    }),
    kpi('completed_period', 'Hoàn thành trong kỳ', completedInPeriod.length, 'count', {
      eligible: completedInPeriod.length,
      excluded: 0,
      reasons: [],
      drilldown: 'status=COMPLETED',
      hint: 'Có ngày hoàn thành thực tế nằm trong kỳ đang lọc.',
    }),
    kpi(
      'on_time_rate',
      'Tỷ lệ đúng hạn',
      onTimeEvaluable.length > 0
        ? Math.round((onTimeCount / onTimeEvaluable.length) * 1000) / 10
        : null,
      'percent',
      {
        eligible: onTimeEvaluable.length,
        excluded: completedInPeriod.length - onTimeEvaluable.length,
        reasons: ['Hoàn thành nhưng thiếu hạn hoặc thiếu ngày hoàn thành thực tế'],
        drilldown: 'status=COMPLETED',
        hint: `Mẫu số = ${onTimeEvaluable.length} việc hoàn thành có đủ hạn và ngày thực tế.`,
      },
    ),
    kpi('avg_progress', 'Tiến độ trung bình điểm cuối', progressResult.value, 'percent', {
      eligible: progressResult.eligible_count,
      excluded: progressResult.excluded_count,
      reasons: ['Công việc khác', 'Chưa lên lịch/Đã lên lịch', 'Chưa có giá trị tiến độ'],
      drilldown: 'status=active&leaf=1',
      hint: 'Trung bình đều theo Sheet nguồn; đã loại nhóm “Công việc khác” và việc chưa khởi động.',
    }),
    kpi('remaining_hours', 'Giờ còn lại', remainingEligible > 0 ? Math.round(remaining * 10) / 10 : null, 'hours', {
      eligible: remainingEligible,
      excluded: activeLeaves.length - remainingEligible,
      reasons: ['Chưa nhập khối lượng giờ'],
      drilldown: 'quality=MISSING_ESTIMATED_HOURS',
      hint: 'Σ giờ ước tính × (1 − tiến độ), chỉ tính điểm cuối đã có khối lượng.',
    }),
    kpi('data_completeness', 'Độ đầy đủ dữ liệu', health.completeness, 'percent', {
      eligible: active.length,
      excluded: 0,
      reasons: [],
      drilldown: 'quality=INCOMPLETE',
      hint: 'Bản ghi hợp lệ / tổng bản ghi đang hoạt động.',
    }),
  ];

  return {
    generated_at: new Date().toISOString(),
    business_date: ctx.today,
    kpis,
    deadline_buckets: computeDeadlineBuckets(active, ctx),
    matrix: {
      p1_overdue: overdue.filter((i) => i.priority === 'P1').length,
      p1_near: nearDue.filter((i) => i.priority === 'P1').length,
      p1_on_track: open.filter(
        (i) => i.priority === 'P1' && !isOverdue(i, ctx.today) && !nearDue.includes(i),
      ).length,
      other_overdue: overdue.filter((i) => i.priority !== 'P1').length,
    },
    interventions: rankInterventions(open, ctx).slice(0, 10),
    by_management_level: groupBy(
      active,
      (i) => ctx.managementLevelCodeOf(i) ?? 'UNKNOWN',
      (key) => (key === 'UNKNOWN' ? 'Chưa phân loại' : labels.managementLevelName(key as ManagementLevelCode)),
      ctx,
    ),
    by_category: groupBy(
      active,
      (i) => ctx.categoryCodeOf(i) ?? 'UNKNOWN',
      (key) => (key === 'UNKNOWN' ? 'Chưa phân loại' : labels.categoryName(key as CategoryCode)),
      ctx,
    ),
    by_unit: groupBy(active, (i) => i.owning_unit_id, labels.unitName, ctx),
    by_assignee: groupBy(
      activeLeaves,
      (i) => i.primary_assignee_id ?? 'UNASSIGNED',
      (key) => (key === 'UNASSIGNED' ? 'Chưa giao' : labels.userName(key)),
      ctx,
    ),
    data_health: health,
  };
}

function kpi(
  key: string,
  label: string,
  value: number | null,
  format: Kpi['format'],
  meta: {
    eligible: number;
    excluded: number;
    reasons: string[];
    drilldown: string;
    hint: string;
  },
): Kpi {
  return {
    key,
    label,
    value,
    format,
    eligible_count: meta.eligible,
    excluded_count: meta.excluded,
    exclusion_reasons: meta.excluded > 0 ? meta.reasons : [],
    drilldown: meta.drilldown,
    hint: meta.hint,
  };
}

export function computeDeadlineBuckets(
  items: readonly WorkItem[],
  ctx: MetricsContext,
): DeadlineBuckets {
  const buckets: DeadlineBuckets = {
    overdue: 0,
    due_0_7: 0,
    due_8_30: 0,
    due_over_30: 0,
    no_deadline: 0,
    completed: 0,
  };

  for (const item of items) {
    if (item.status === 'COMPLETED') {
      buckets.completed += 1;
      continue;
    }
    const end = item.display_end ?? item.planned_end;
    if (item.schedule_type !== 'DEADLINE' || !end) {
      buckets.no_deadline += 1;
      continue;
    }
    const left = businessDaysLeft(ctx.today, end, ctx.calendar);
    if (left === null) buckets.no_deadline += 1;
    else if (left < 0) buckets.overdue += 1;
    else if (left <= ctx.deadlineWarningDays) buckets.due_0_7 += 1;
    else if (left <= 30) buckets.due_8_30 += 1;
    else buckets.due_over_30 += 1;
  }

  return buckets;
}

/**
 * Xếp hạng “việc cần can thiệp” — thay cho việc bắt quản lý tự đọc bảng.
 * Điểm là tổng có trọng số, mỗi thành phần đều kèm lý do hiển thị được.
 */
export function rankInterventions(
  items: readonly WorkItem[],
  ctx: MetricsContext,
): InterventionItem[] {
  const out: InterventionItem[] = [];

  for (const item of items) {
    const reasons: string[] = [];
    let score = 0;

    const end = item.display_end ?? item.planned_end;
    const daysLeft = businessDaysLeft(ctx.today, end, ctx.calendar);

    if (isOverdue(item, ctx.today)) {
      const overdueBy = daysLeft === null ? 1 : Math.abs(daysLeft);
      score += 50 + Math.min(overdueBy, 30);
      reasons.push(`Quá hạn ${overdueBy} ngày làm việc`);
    } else if (daysLeft !== null && daysLeft <= ctx.deadlineWarningDays) {
      score += 25 - daysLeft;
      reasons.push(`Còn ${daysLeft} ngày làm việc`);
    }

    if (item.priority === 'P1') {
      score += 30;
      reasons.push('Ưu tiên P1');
    } else if (item.priority === 'P2') {
      score += 12;
    }

    if (item.data_quality_status === 'INVALID') {
      score += 20;
      reasons.push('Dữ liệu sai, không đưa vào báo cáo được');
    } else if (item.data_quality_status === 'INCOMPLETE') {
      score += 8;
      reasons.push('Thiếu dữ liệu bắt buộc');
    }

    if (item.is_leaf && !item.primary_assignee_id) {
      score += 15;
      reasons.push('Chưa có người thực hiện');
    }

    if (item.status === 'PAUSED') {
      score += 10;
      reasons.push('Đang tạm dừng');
    }

    if (score <= 0) continue;

    out.push({
      work_item_id: item.id,
      code: item.code,
      title: item.title,
      level: item.level,
      status: item.status,
      priority: item.priority,
      assignee_id: item.primary_assignee_id,
      owning_unit_id: item.owning_unit_id,
      display_end: end,
      days_left: daysLeft,
      progress: item.effective_progress,
      score,
      reasons,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function groupBy(
  items: readonly WorkItem[],
  keyOf: (item: WorkItem) => string,
  labelOf: (key: string) => string,
  ctx: MetricsContext,
): Breakdown[] {
  const groups = new Map<string, WorkItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const progress = averageProgress(group, ctx.progress);
      return {
        key,
        label: labelOf(key),
        total: group.length,
        completed: group.filter((i) => i.status === 'COMPLETED').length,
        overdue: group.filter((i) => isOverdue(i, ctx.today)).length,
        progress: progress.value,
        progress_eligible: progress.eligible_count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Báo cáo kỳ — guideline 11.2 / 11.3
// ---------------------------------------------------------------------------

export interface OneOffReportRow {
  level: WorkLevel | 'TOTAL';
  completed: number;
  missing_completion_date: number;
  on_time: number;
  late: number;
  /** `null` khi mẫu số = 0. */
  on_time_rate: number | null;
}

export interface PeriodReport {
  period: DateRange;
  generated_at: string;
  one_off: OneOffReportRow[];
  recurring: ExecutionSummary;
  totals: {
    completed: number;
    on_time: number;
    late: number;
    on_time_rate: number | null;
    missing_completion_date: number;
    actual_hours: number;
    overdue_open: number;
    active_open: number;
  };
  /** Kết luận theo rule minh bạch, không AI (guideline 11.5). */
  conclusion: { text: string; confident: boolean; missing_params: number };
}

export function computePeriodReport(
  items: readonly WorkItem[],
  logs: readonly ExecutionLog[],
  period: DateRange,
  ctx: MetricsContext,
): PeriodReport {
  const completed = items.filter((i) => i.status === 'COMPLETED' && isWithin(i.completed_at, period));

  // Việc completed nhưng thiếu ngày thực tế: không lọt vào `completed` ở trên, phải đếm riêng.
  const missingCompletionDate = items.filter((i) => i.status === 'COMPLETED' && !i.completed_at);

  const rowFor = (level: WorkLevel | 'TOTAL'): OneOffReportRow => {
    const scope = level === 'TOTAL' ? completed : completed.filter((i) => i.level === level);
    const evaluable = scope
      .map((i) => completedOnTime(i))
      .filter((v): v is boolean => v !== null);
    const onTime = evaluable.filter(Boolean).length;
    const late = evaluable.length - onTime;
    return {
      level,
      completed: scope.length,
      missing_completion_date:
        level === 'TOTAL'
          ? missingCompletionDate.length
          : missingCompletionDate.filter((i) => i.level === level).length,
      on_time: onTime,
      late,
      on_time_rate: evaluable.length > 0 ? Math.round((onTime / evaluable.length) * 1000) / 10 : null,
    };
  };

  const oneOff = [rowFor('TOTAL'), rowFor(3), rowFor(4), rowFor(5), rowFor(6)];
  const recurring = summarizeExecutionLogs(logs, period);
  const total = oneOff[0];

  const openItems = items.filter(isOpen);
  const overdueOpen = openItems.filter((i) => isOverdue(i, ctx.today)).length;

  // Đếm tham số tải còn thiếu — quyết định có được kết luận hay không (guideline 11.5).
  const missingParams = items
    .filter((i) => isActiveLeaf(i) && i.schedule_type !== 'UNSCHEDULED')
    .reduce((sum, i) => {
      let n = 0;
      if (i.effective_estimated_hours === null) n += 1;
      if (!i.allocation_unit) n += 1;
      if (i.allocation_hours === null || i.allocation_hours === undefined) n += 1;
      return sum + n;
    }, 0);

  const confident = missingParams === 0;
  const conclusion = confident
    ? total.completed === 0
      ? {
          text: 'Chưa có công việc nào được ghi nhận hoàn thành trong kỳ.',
          confident: true,
          missing_params: 0,
        }
      : {
          text: `Hoàn thành ${total.completed} việc, đúng hạn ${total.on_time}, trễ ${total.late}. Còn ${overdueOpen} việc quá hạn cần xử lý.`,
          confident: true,
          missing_params: 0,
        }
    : {
        text: `Chưa đủ dữ liệu để kết luận: thiếu ${missingParams} tham số tải. Hãy hoàn thiện dữ liệu trước khi đánh giá.`,
        confident: false,
        missing_params: missingParams,
      };

  return {
    period,
    generated_at: new Date().toISOString(),
    one_off: oneOff,
    recurring,
    totals: {
      completed: total.completed,
      on_time: total.on_time,
      late: total.late,
      on_time_rate: total.on_time_rate,
      missing_completion_date: total.missing_completion_date,
      actual_hours: recurring.actual_hours,
      overdue_open: overdueOpen,
      active_open: openItems.length,
    },
    conclusion,
  };
}

/**
 * Khung đánh giá 40/25/25/10 của Sheet — **chỉ hiển thị tham chiếu**, không chấm điểm nhân sự
 * (guideline 8.10 + NEED_CONFIRMATION B6).
 */
export const FAIRNESS_FRAMEWORK = [
  { key: 'completion', label: 'Hoàn thành theo khối lượng', weight: 40, rule: 'Giờ/điểm hoàn thành ÷ khối lượng cam kết.' },
  { key: 'on_time', label: 'Đúng hạn theo khối lượng', weight: 25, rule: 'Giờ/điểm đúng hạn ÷ khối lượng hoàn thành.' },
  { key: 'load', label: 'Mức đóng góp tải', weight: 25, rule: 'Tải phân bổ/ngày so với năng lực ngày.' },
  { key: 'backlog', label: 'Kiểm soát tồn đọng', weight: 10, rule: '1 − khối lượng quá hạn ÷ khối lượng cam kết.' },
] as const;
