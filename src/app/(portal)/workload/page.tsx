import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Users2 } from 'lucide-react';

import { UtilizationChart, type ChartTone } from '@/components/charts/charts';
import { LoadStateBadge } from '@/components/ui/badges';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { TableShell, Td, Th, Tr } from '@/components/ui/table';
import { formatDateRange, weekRange, monthRange } from '@/domain/business-days';
import { FAIRNESS_FRAMEWORK } from '@/domain/metrics';
import { formatHours, formatInteger, formatPercent } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { getWorkloadSnapshot } from '@/server/services/dashboard';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Sức Tải' };

const TONE_BY_STATE: Record<string, ChartTone> = {
  OVER_CAPACITY: 'danger',
  NEAR_CAPACITY: 'warning',
  NORMAL: 'success',
  INSUFFICIENT_DATA: 'muted',
};

export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  const { range: rangeParam } = await searchParams;
  const ctx = await getBocContext();

  const period = rangeParam === 'month' ? monthRange(ctx.today) : weekRange(ctx.today);
  const { rows, range, unassignedCount } = await getWorkloadSnapshot(user, period);

  const conclusive = rows.filter((r) => r.state !== 'INSUFFICIENT_DATA');
  const overloaded = rows.filter((r) => r.state === 'OVER_CAPACITY');
  const insufficient = rows.filter((r) => r.state === 'INSUFFICIENT_DATA' && r.item_count > 0);
  const totalGaps = rows.reduce((sum, r) => sum + r.items_with_gaps, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sức Tải công việc"
        description={
          <>
            Khoảng đánh giá {formatDateRange(range)}. Tải quy đổi theo công thức:{' '}
            <strong>giờ/ngày</strong> dùng thẳng, <strong>giờ/tuần</strong> chia{' '}
            {ctx.capacity.capacityDaysPerWeek}. Ngưỡng cận tải{' '}
            {formatPercent(ctx.capacity.nearCapacityThreshold * 100)}.
          </>
        }
        actions={
          <div className="flex rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
            <Link
              href="/workload"
              className={
                rangeParam !== 'month'
                  ? 'rounded bg-[var(--brand-600)] px-3 py-1.5 text-white'
                  : 'rounded px-3 py-1.5 hover:bg-[var(--surface-hover)]'
              }
            >
              Tuần này
            </Link>
            <Link
              href="/workload?range=month"
              className={
                rangeParam === 'month'
                  ? 'rounded bg-[var(--brand-600)] px-3 py-1.5 text-white'
                  : 'rounded px-3 py-1.5 hover:bg-[var(--surface-hover)]'
              }
            >
              Tháng này
            </Link>
          </div>
        }
      />

      {totalGaps > 0 ? (
        <Alert tone="warning" title={`${totalGaps} công việc thiếu tham số tải`}>
          Thiếu tổng giờ, đơn vị phân bổ hoặc giờ/kỳ ⇒ hệ thống <strong>không</strong> kết luận
          người đó nhàn hay quá tải.{' '}
          <Link href="/work-items?dq=INCOMPLETE" className="font-medium underline">
            Xem danh sách cần bổ sung
          </Link>
        </Alert>
      ) : null}

      {unassignedCount > 0 ? (
        <Alert tone="warning" title={`${unassignedCount} điểm cuối chưa có người thực hiện`}>
          Khối lượng của những việc này chưa được tính vào tải của bất kỳ ai.{' '}
          <Link href="/work-items?warning=missing_assignee" className="font-medium underline">
            Giao việc ngay
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <Stat label="Người có việc trong kỳ" value={formatInteger(rows.filter((r) => r.item_count > 0).length)} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Đang quá tải"
              value={formatInteger(overloaded.length)}
              tone={overloaded.length > 0 ? 'danger' : undefined}
              hint="Tải cam kết vượt 100% công suất"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Chưa kết luận được"
              value={formatInteger(insufficient.length)}
              tone={insufficient.length > 0 ? 'warning' : undefined}
              hint="Do thiếu tham số đầu vào"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Giờ tồn quá hạn"
              value={formatHours(rows.reduce((sum, r) => sum + r.overdue_remaining_hours, 0))}
              hint="Khối lượng còn lại của việc đã quá hạn"
            />
          </CardBody>
        </Card>
      </div>

      {conclusive.length > 0 ? (
        <Card>
          <CardHeader
            icon={Users2}
            title="Mức sử dụng công suất"
            description="Chỉ vẽ những người có đủ tham số để kết luận."
          />
          <CardBody>
            <UtilizationChart
              data={conclusive.slice(0, 12).map((row) => ({
                label: row.full_name,
                value: Math.round(row.utilization * 100),
                tone: TONE_BY_STATE[row.state] ?? 'muted',
              }))}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Chi tiết theo người"
          description="Tải cam kết là tổng phân bổ đã quy đổi; tải cần thiết là khối lượng còn lại chia số ngày làm việc còn lại."
        />
        {rows.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="Chưa có dữ liệu tải"
            description="Không có người dùng nào trong phạm vi dữ liệu của bạn."
          />
        ) : (
          <TableShell caption="Tải nguồn lực theo người">
            <thead>
              <tr>
                <Th sticky>Người thực hiện</Th>
                <Th>Đơn vị</Th>
                <Th align="right">Việc đang mở</Th>
                <Th align="right">Công suất</Th>
                <Th align="right">Tải cam kết</Th>
                <Th align="right">Tải cần thiết</Th>
                <Th align="right">% công suất</Th>
                <Th align="right">Giờ tồn quá hạn</Th>
                <Th>Trạng thái</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.user_id}>
                  <Td sticky>
                    <Link href={`/work-items?assignee=${row.user_id}`} className="hover:underline">
                      {row.full_name}
                    </Link>
                    {row.job_title ? (
                      <span className="block text-[11px] text-[var(--text-subtle)]">
                        {row.job_title}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-xs text-[var(--text-muted)]">{row.unit_name}</Td>
                  <Td align="right">{formatInteger(row.item_count)}</Td>
                  <Td align="right">{formatHours(row.capacity_hours_per_day)}/ngày</Td>
                  <Td align="right">{formatHours(row.planned_daily)}/ngày</Td>
                  <Td align="right">{formatHours(row.required_daily)}/ngày</Td>
                  <Td
                    align="right"
                    className={
                      row.state === 'OVER_CAPACITY'
                        ? 'text-[var(--tone-danger-text)]'
                        : row.state === 'NEAR_CAPACITY'
                          ? 'text-[var(--tone-warning-text)]'
                          : undefined
                    }
                  >
                    {row.state === 'INSUFFICIENT_DATA'
                      ? '—'
                      : formatPercent(row.utilization * 100)}
                  </Td>
                  <Td align="right">
                    {row.overdue_remaining_hours > 0 ? formatHours(row.overdue_remaining_hours) : '—'}
                  </Td>
                  <Td>
                    <LoadStateBadge state={row.state} />
                    {row.items_with_gaps > 0 ? (
                      <span className="mt-1 block text-[10px] text-[var(--text-subtle)]">
                        {row.items_with_gaps} việc thiếu tham số
                      </span>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <CardHeader
          icon={AlertTriangle}
          title="Khung đánh giá công bằng (tham chiếu)"
          description="Lấy nguyên từ Sheet nguồn. MVP chỉ hiển thị khung và các thành phần — hệ thống KHÔNG tự chấm điểm hay xếp loại nhân sự."
        />
        <CardBody>
          <table className="w-full text-sm">
            <caption className="sr-only">Khung đánh giá công bằng</caption>
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                <th scope="col" className="pb-2 text-left font-semibold">Chỉ tiêu</th>
                <th scope="col" className="pb-2 text-right font-semibold">Trọng số</th>
                <th scope="col" className="pb-2 text-left font-semibold">Nguyên tắc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {FAIRNESS_FRAMEWORK.map((row) => (
                <tr key={row.key}>
                  <td className="py-2 pr-3 font-medium">{row.label}</td>
                  <td className="tabular py-2 pr-3 text-right">{row.weight}%</td>
                  <td className="py-2 text-[var(--text-muted)]">{row.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
            Chỉ xếp loại khi dữ liệu đủ và có phê duyệt của Product Owner; đọc đồng thời ba trục kết
            quả, đúng hạn và tải — không dùng riêng % hoàn thành.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
