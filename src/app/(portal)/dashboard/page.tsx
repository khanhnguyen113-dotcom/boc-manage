import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flag,
  Gauge,
  ListTree,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';

import { DataHealthDonut, DeadlineRhythmChart } from '@/components/charts/charts';
import { LevelBadge, PriorityBadge, StatusBadge } from '@/components/ui/badges';
import {
  Alert,
  Badge,
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
import { getControlTowerSnapshot, type PeriodKind } from '@/server/services/dashboard';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Tổng quan' };

const KPI_ICONS = {
  active_nodes: ListTree,
  active_leaves: Target,
  p1_active: Flag,
  overdue: AlertOctagon,
  near_due: CalendarClock,
  completed_period: CheckCircle2,
  on_time_rate: TrendingUp,
  avg_progress: Gauge,
  remaining_hours: Clock,
  data_completeness: ShieldCheck,
} as const;

const KPI_EMPHASIS: Record<string, 'danger' | 'warning' | undefined> = {
  overdue: 'danger',
  near_due: 'warning',
  p1_active: 'warning',
};

const PERIODS: { key: PeriodKind; label: string }[] = [
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'year', label: 'Năm nay' },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string; denied?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const ctx = await getBocContext();

  const period = (PERIODS.find((p) => p.key === params.period)?.key ?? 'month') as PeriodKind;

  const { snapshot, period: range } = await getControlTowerSnapshot(user, {
    period,
    unitId: params.unit,
  });

  const buckets = snapshot.deadline_buckets;
  const health = snapshot.data_health;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control Tower"
        description={
          <>
            Kỳ đang xem: <strong>{formatDateRange(range)}</strong>. Mọi chỉ số tính theo phạm vi dữ
            liệu bạn được cấp và ngày nghiệp vụ {formatDate(snapshot.business_date)}.
          </>
        }
        actions={
          <nav aria-label="Chọn kỳ" className="flex rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/dashboard?period=${p.key}`}
                aria-current={p.key === period ? 'true' : undefined}
                className={
                  p.key === period
                    ? 'rounded-[calc(var(--radius)-2px)] bg-[var(--brand-600)] px-3 py-1.5 text-xs font-medium text-white'
                    : 'rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                }
              >
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      {params.denied ? (
        <Alert tone="warning" title="Không đủ quyền truy cập trang vừa yêu cầu">
          Bạn đã được đưa về Tổng quan. Capability còn thiếu:{' '}
          <code className="font-mono text-[11px]">{params.denied}</code>
        </Alert>
      ) : null}

      {ctx.unconfirmedHolidayCount > 0 ? (
        <Alert tone="warning" title="Lịch nghỉ chưa được HR xác nhận">
          Có {ctx.unconfirmedHolidayCount} ngày nghỉ đang ở trạng thái “tham chiếu”. Số ngày làm
          việc còn lại và các mốc quá hạn có thể lệch cho tới khi BOC/HR chốt lịch chính thức.{' '}
          <Link href="/admin/holidays" className="font-medium underline">
            Xem lịch nghỉ
          </Link>
        </Alert>
      ) : null}

      {/* --- KPI --------------------------------------------------------- */}
      <section aria-label="Chỉ số chính">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {snapshot.kpis.map((kpi) => (
            <KpiCard
              key={kpi.key}
              kpi={kpi}
              href={`/work-items?${kpi.drilldown}`}
              icon={KPI_ICONS[kpi.key as keyof typeof KPI_ICONS]}
              emphasis={KPI_EMPHASIS[kpi.key]}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* --- Việc cần can thiệp ---------------------------------------- */}
        <Card className="xl:col-span-2">
          <CardHeader
            icon={AlertOctagon}
            title="Việc cần can thiệp"
            description="Xếp hạng theo mức quá hạn, ưu tiên, chất lượng dữ liệu và tình trạng phân công."
            action={
              <ButtonLink href="/work-items?warning=overdue" size="sm" variant="ghost">
                Xem tất cả
              </ButtonLink>
            }
          />
          {snapshot.interventions.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Không có việc nào cần can thiệp"
              description="Trong phạm vi dữ liệu của bạn, không có công việc quá hạn, sắp đến hạn gấp hoặc thiếu dữ liệu nghiêm trọng."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {snapshot.interventions.map((item) => (
                <li key={item.work_item_id}>
                  <Link
                    href={`/work-items/${item.work_item_id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <LevelBadge level={item.level} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
                        <code className="font-mono">{item.code}</code>
                        <span aria-hidden>·</span>
                        <span>{ctx.names.unitName(item.owning_unit_id)}</span>
                        <span aria-hidden>·</span>
                        <span>{ctx.names.userName(item.assignee_id)}</span>
                      </span>
                    </span>

                    <span className="flex w-32 shrink-0 flex-col gap-1">
                      <ProgressBar value={item.progress} size="sm" />
                    </span>

                    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={item.priority} />
                      <StatusBadge status={item.status} />
                    </span>

                    <span className="w-full text-[11px] text-[var(--text-muted)] sm:w-auto sm:min-w-40 sm:text-right">
                      {item.reasons.join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --- Nhịp deadline --------------------------------------------- */}
        <Card>
          <CardHeader
            icon={CalendarClock}
            title="Nhịp deadline"
            description={`Tính theo ngày làm việc, ngưỡng cảnh báo ${ctx.deadlineWarningDays} ngày.`}
          />
          <CardBody className="space-y-4">
            <DeadlineRhythmChart
              data={[
                { label: 'Quá hạn', value: buckets.overdue, tone: 'danger' },
                { label: `0–${ctx.deadlineWarningDays}`, value: buckets.due_0_7, tone: 'warning' },
                { label: '8–30', value: buckets.due_8_30, tone: 'info' },
                { label: '>30', value: buckets.due_over_30, tone: 'progress' },
                { label: 'Chưa hạn', value: buckets.no_deadline, tone: 'muted' },
                { label: 'Xong', value: buckets.completed, tone: 'success' },
              ]}
            />

            <dl className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 text-xs">
              <MatrixRow
                label="P1 quá hạn"
                value={snapshot.matrix.p1_overdue}
                href="/work-items?priority=P1&warning=overdue"
                tone="danger"
              />
              <MatrixRow
                label="P1 sắp đến hạn"
                value={snapshot.matrix.p1_near}
                href="/work-items?priority=P1&warning=near_due"
                tone="warning"
              />
              <MatrixRow
                label="P1 đúng tiến độ"
                value={snapshot.matrix.p1_on_track}
                href="/work-items?priority=P1"
                tone="success"
              />
              <MatrixRow
                label="Quá hạn khác"
                value={snapshot.matrix.other_overdue}
                href="/work-items?warning=overdue"
                tone="muted"
              />
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* --- Chất lượng dữ liệu ---------------------------------------- */}
        <Card>
          <CardHeader
            icon={ShieldCheck}
            title="Chất lượng dữ liệu"
            description="Không đánh giá tiến độ hay tải trên bản ghi thiếu dữ liệu bắt buộc."
            action={
              <ButtonLink href="/reports/data-health" size="sm" variant="ghost">
                Chi tiết
              </ButtonLink>
            }
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
                <li key={row.code}>
                  <Link
                    href={`/work-items?quality=${row.code}`}
                    className="flex items-center justify-between gap-2 rounded px-1 py-1 text-xs hover:bg-[var(--surface-hover)]"
                  >
                    <span className="min-w-0 truncate text-[var(--text-muted)]">
                      {DATA_QUALITY_LABELS[row.code as DataQualityCode] ?? row.code}
                    </span>
                    <Badge tone={row.severity === 'INVALID' ? 'danger' : 'warning'}>
                      {formatInteger(row.count)}
                    </Badge>
                  </Link>
                </li>
              ))}
              {health.by_code.length === 0 ? (
                <li className="py-2 text-center text-xs text-[var(--text-muted)]">
                  Toàn bộ bản ghi trong phạm vi đều hợp lệ.
                </li>
              ) : null}
            </ul>
          </CardBody>
        </Card>

        {/* --- Tiến độ theo chiều quản trị -------------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            icon={Gauge}
            title="Tiến độ theo đơn vị"
            description="Trung bình đều trên các bản ghi đủ điều kiện; số trong ngoặc là mẫu số thực tế."
          />
          <CardBody>
            {snapshot.by_unit.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu" description="Không có công việc nào trong phạm vi." />
            ) : (
              <ul className="space-y-3">
                {snapshot.by_unit.slice(0, 8).map((row) => (
                  <li key={row.key} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <Link
                        href={`/work-items?unit=${row.key}`}
                        className="font-medium text-[var(--text)] hover:underline"
                      >
                        {row.label}
                      </Link>
                      <span className="tabular text-[var(--text-muted)]">
                        {formatInteger(row.total)} việc · hoàn thành {formatInteger(row.completed)}
                        {row.overdue > 0 ? (
                          <span className="ml-1 text-[var(--tone-danger-text)]">
                            · quá hạn {formatInteger(row.overdue)}
                          </span>
                        ) : null}
                        <span className="ml-1 text-[var(--text-subtle)]">
                          ({formatInteger(row.progress_eligible)} bản ghi tính tiến độ)
                        </span>
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

      {/* --- Phân bổ theo nhóm công việc và người --------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="Theo nhóm công việc (Lớp 2)"
          description="Nhóm “Công việc khác” được loại khỏi tiến độ trung bình quản trị theo quy tắc nguồn."
          rows={snapshot.by_category}
          hrefBase="/work-items?category="
        />
        <BreakdownCard
          title="Theo người thực hiện"
          description="Chỉ tính điểm cuối — không cộng trùng giữa công việc cha và con."
          rows={snapshot.by_assignee}
          hrefBase="/work-items?assignee="
        />
      </div>

      <p className="text-center text-[11px] text-[var(--text-subtle)]">
        Cập nhật lúc{' '}
        {new Intl.DateTimeFormat('vi-VN', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(new Date(snapshot.generated_at))}
        {' · '}
        Mọi thẻ chỉ số đều bấm được để mở đúng danh sách bản ghi nguồn
      </p>
    </div>
  );
}

function MatrixRow({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: 'danger' | 'warning' | 'success' | 'muted';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd>
        <Link href={href}>
          <Badge tone={tone}>{formatInteger(value)}</Badge>
        </Link>
      </dd>
    </div>
  );
}

function BreakdownCard({
  title,
  description,
  rows,
  hrefBase,
}: {
  title: string;
  description: string;
  rows: { key: string; label: string; total: number; completed: number; overdue: number; progress: number | null; progress_eligible: number }[];
  hrefBase: string;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {rows.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu" />
        ) : (
          <table className="w-full text-xs">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                <th scope="col" className="pb-2 text-left font-semibold">
                  Nhóm
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Tổng
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Xong
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Quá hạn
                </th>
                <th scope="col" className="w-28 pb-2 text-right font-semibold">
                  Tiến độ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.slice(0, 8).map((row) => (
                <tr key={row.key}>
                  <td className="py-2 pr-2">
                    <Link href={`${hrefBase}${row.key}`} className="hover:underline">
                      {row.label}
                    </Link>
                  </td>
                  <td className="tabular py-2 text-right">{formatInteger(row.total)}</td>
                  <td className="tabular py-2 text-right text-[var(--tone-success-text)]">
                    {formatInteger(row.completed)}
                  </td>
                  <td className="tabular py-2 text-right text-[var(--tone-danger-text)]">
                    {row.overdue > 0 ? formatInteger(row.overdue) : '—'}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <span className="tabular text-[var(--text-muted)]">
                      {formatPercent(row.progress)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}
