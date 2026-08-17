import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertOctagon,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Flag,
  Gauge,
  ShieldCheck,
  Target,
  Timer,
  UserCheck,
} from 'lucide-react';

import { DataHealthDonut, DeadlineRhythmChart } from '@/components/charts/charts';
import { LevelBadge, PriorityBadge, StatusBadge } from '@/components/ui/badges';
import { Select } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives';
import { KpiCard, ProgressBar } from '@/components/ui/progress';
import { formatDate, formatDateRange } from '@/domain/business-days';
import { DATA_QUALITY_LABELS, type DataQualityCode } from '@/domain/data-quality';
import { formatInteger, formatPercent } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listActiveProfiles, listUnits } from '@/server/repositories/catalogs';
import { getControlTowerSnapshot, type PeriodKind } from '@/server/services/dashboard';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Tổng quan' };

const KPI_ICONS = {
  active_leaves: Target,
  p1_active: Flag,
  p2_active: Flag,
  due_3_7: CalendarClock,
  due_1_2: Timer,
  due_today: CalendarCheck,
  overdue: AlertOctagon,
  completed_period: CheckCircle2,
  data_completeness: ShieldCheck,
} as const;

const KPI_EMPHASIS: Record<string, 'danger' | 'warning' | 'success' | undefined> = {
  overdue: 'danger',
  due_today: 'danger',
  due_1_2: 'warning',
  due_3_7: 'warning',
  p1_active: 'warning',
  completed_period: 'success',
};

const PERIODS: { key: PeriodKind; label: string }[] = [
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'year', label: 'Năm nay' },
];

interface DashboardParams {
  period?: string;
  unit?: string;
  assignee?: string;
  denied?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const ctx = await getBocContext();
  const period = (PERIODS.find((p) => p.key === params.period)?.key ?? 'month') as PeriodKind;

  const [{ snapshot, period: range }, units, profiles] = await Promise.all([
    getControlTowerSnapshot(user, {
      period,
      unitId: params.unit,
      assigneeId: params.assignee,
    }),
    listUnits(),
    listActiveProfiles(),
  ]);

  const buckets = snapshot.deadline_buckets;
  const health = snapshot.data_health;
  const selectedUnit = units.find((unit) => unit.id === params.unit);
  const selectedAssignee = profiles.find((profile) => profile.user_id === params.assignee);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control Tower"
        description={
          <>
            Kỳ <strong>{formatDateRange(range)}</strong>
            {selectedUnit ? <> · đơn vị <strong>{selectedUnit.name}</strong></> : null}
            {selectedAssignee ? <> · người thực hiện <strong>{selectedAssignee.full_name}</strong></> : null}.
            {' '}Ngày nghiệp vụ {formatDate(snapshot.business_date)}.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <nav
              aria-label="Chọn kỳ"
              className="flex rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5"
            >
              {PERIODS.map((option) => (
                <Link
                  key={option.key}
                  href={dashboardHref({ ...params, period: option.key })}
                  aria-current={option.key === period ? 'true' : undefined}
                  className={
                    option.key === period
                      ? 'rounded-[calc(var(--radius)-2px)] bg-[var(--brand-600)] px-3 py-1.5 text-xs font-medium text-white'
                      : 'rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                  }
                >
                  {option.label}
                </Link>
              ))}
            </nav>
            <ButtonLink href="/calendar" size="sm" variant="ghost">
              Xem lịch nghỉ để biết số ngày làm việc
            </ButtonLink>
          </div>
        }
      />

      {params.denied ? (
        <Alert tone="warning" title="Không đủ quyền truy cập trang vừa yêu cầu">
          Capability còn thiếu: <code className="font-mono text-[11px]">{params.denied}</code>
        </Alert>
      ) : null}

      <Card>
        <form action="/dashboard" method="get" className="flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="period" value={period} />
          <label className="min-w-56 flex-1 text-xs text-[var(--text-muted)]">
            <span className="mb-1.5 block font-medium">Đơn vị</span>
            <Select name="unit" defaultValue={params.unit ?? ''}>
              <option value="">Tất cả đơn vị trong phạm vi</option>
              {units.filter((unit) => unit.is_active).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </Select>
          </label>
          <label className="min-w-56 flex-1 text-xs text-[var(--text-muted)]">
            <span className="mb-1.5 block font-medium">Người thực hiện</span>
            <Select name="assignee" defaultValue={params.assignee ?? ''}>
              <option value="">Tất cả người thực hiện</option>
              {profiles.map((profile) => (
                <option key={profile.user_id} value={profile.user_id}>{profile.full_name}</option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="primary" size="sm">Áp dụng bộ lọc</Button>
          {params.unit || params.assignee ? (
            <ButtonLink href={`/dashboard?period=${period}`} variant="ghost" size="sm">Xóa bộ lọc</ButtonLink>
          ) : null}
        </form>
      </Card>

      <section aria-label="Chỉ số chính">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {snapshot.kpis.map((kpi) => (
            <KpiCard
              key={kpi.key}
              kpi={kpi}
              href={workItemDrilldown(kpi.drilldown, params)}
              icon={KPI_ICONS[kpi.key as keyof typeof KPI_ICONS]}
              emphasis={KPI_EMPHASIS[kpi.key]}
            />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader
          icon={CalendarClock}
          title="Nhịp deadline"
          description="Các nhóm deadline không chồng lặp và được tính theo ngày làm việc."
        />
        <CardBody>
          <DeadlineRhythmChart
            data={[
              { label: 'Quá hạn', value: buckets.overdue, tone: 'danger' },
              { label: 'Hôm nay', value: buckets.due_today, tone: 'danger' },
              { label: '1–2 ngày', value: buckets.due_1_2, tone: 'warning' },
              { label: '3–7 ngày', value: buckets.due_3_7, tone: 'info' },
              { label: '8–30 ngày', value: buckets.due_8_30, tone: 'progress' },
              { label: '>30 ngày', value: buckets.due_over_30, tone: 'muted' },
              { label: 'Đã xong', value: buckets.completed, tone: 'success' },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={AlertOctagon}
          title="Việc cần can thiệp"
          description="Chỉ hiển thị công việc đến hạn hôm nay hoặc đã quá hạn, tối đa 5 dòng."
          action={<ButtonLink href={workItemDrilldown('warning=overdue', params)} size="sm" variant="ghost">Xem tất cả quá hạn</ButtonLink>}
        />
        {snapshot.interventions.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Không có việc đến hạn hôm nay hoặc quá hạn" />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {snapshot.interventions.map((item) => (
              <li key={item.work_item_id}>
                <Link
                  href={`/work-items/${item.work_item_id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-[var(--surface-hover)]"
                >
                  <LevelBadge level={item.level} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {ctx.names.unitName(item.owning_unit_id)} · {ctx.names.userName(item.assignee_id)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <PriorityBadge priority={item.priority} />
                    <StatusBadge status={item.status} />
                  </span>
                  <span className="text-xs font-medium text-[var(--tone-danger-text)]">
                    {item.reasons.find((reason) => reason.startsWith('Quá hạn') || reason === 'Đến hạn hôm nay')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            icon={ShieldCheck}
            title="Chất lượng dữ liệu"
            action={<ButtonLink href="/reports/data-health" size="sm" variant="ghost">Chi tiết</ButtonLink>}
          />
          <CardBody className="space-y-3">
            <DataHealthDonut
              data={[
                { label: 'Đủ dữ liệu', value: health.valid, tone: 'success' },
                { label: 'Thiếu dữ liệu', value: health.incomplete, tone: 'warning' },
                { label: 'Dữ liệu sai', value: health.invalid, tone: 'danger' },
              ]}
            />
            <ul className="space-y-1.5 border-t border-[var(--border)] pt-3">
              {health.by_code.slice(0, 5).map((row) => (
                <li key={row.code} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[var(--text-muted)]">
                    {DATA_QUALITY_LABELS[row.code as DataQualityCode] ?? row.code}
                  </span>
                  <Badge tone={row.severity === 'INVALID' ? 'danger' : 'warning'}>{formatInteger(row.count)}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={Gauge} title="Tiến độ theo đơn vị" description="Chỉ số trong ngoặc là số bản ghi đủ điều kiện tính tiến độ." />
          <CardBody>
            {snapshot.by_unit.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu" />
            ) : (
              <ul className="space-y-3">
                {snapshot.by_unit.slice(0, 8).map((row) => (
                  <li key={row.key} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <Link href={`/work-items?unit=${row.key}`} className="font-medium hover:underline">{row.label}</Link>
                      <span className="text-[var(--text-muted)]">
                        {formatInteger(row.total)} việc · hoàn thành {formatInteger(row.completed)} · ({formatInteger(row.progress_eligible)} hợp lệ)
                      </span>
                    </div>
                    <ProgressBar value={row.progress} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={UserCheck} title="Chất lượng theo người thực hiện" description="Tỷ lệ điểm cuối có dữ liệu hợp lệ theo từng người." />
          <CardBody>
            {snapshot.by_assignee.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu" />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                    <th className="pb-2 text-left">Người thực hiện</th>
                    <th className="pb-2 text-right">Điểm cuối</th>
                    <th className="pb-2 text-right">Độ đầy đủ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {snapshot.by_assignee.slice(0, 8).map((row) => (
                    <tr key={row.key}>
                      <td className="py-2"><Link href={`/work-items?assignee=${row.key}`} className="hover:underline">{row.label}</Link></td>
                      <td className="py-2 text-right">{formatInteger(row.total)}</td>
                      <td className="py-2 text-right font-medium">{formatPercent(row.data_completeness)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={ExternalLink}
            title="Link kết quả mới nhất"
            description="5 kết quả được cập nhật gần nhất."
            action={<ButtonLink href="/work-items?result=1&sort=updated_at&dir=desc" size="sm" variant="ghost">Chi tiết</ButtonLink>}
          />
          {snapshot.recent_results.length === 0 ? (
            <EmptyState title="Chưa có link kết quả" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {snapshot.recent_results.map((result) => (
                <li key={result.work_item_id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/work-items/${result.work_item_id}`} className="block truncate text-sm font-medium hover:underline">{result.title}</Link>
                    <span className="text-[11px] text-[var(--text-muted)]">{ctx.names.userName(result.assignee_id)} · cập nhật {formatDate(result.updated_at.slice(0, 10))}</span>
                  </span>
                  <a href={result.result_link} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--brand-700)] hover:underline">Mở kết quả</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function dashboardHref(params: DashboardParams): string {
  const query = new URLSearchParams();
  if (params.period) query.set('period', params.period);
  if (params.unit) query.set('unit', params.unit);
  if (params.assignee) query.set('assignee', params.assignee);
  return `/dashboard?${query.toString()}`;
}

function workItemDrilldown(drilldown: string, params: DashboardParams): string {
  const query = new URLSearchParams(drilldown);
  if (params.unit) query.set('unit', params.unit);
  if (params.assignee) query.set('assignee', params.assignee);
  return `/work-items?${query.toString()}`;
}
