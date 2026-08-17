import type { Metadata } from 'next';
import Link from 'next/link';
import { FileDown, ShieldCheck } from 'lucide-react';

import { Select } from '@/components/ui/form';

import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { formatDateRange } from '@/domain/business-days';
import { EMPTY, formatHours, formatInteger, formatPercent } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listUnits } from '@/server/repositories/catalogs';
import { getPeriodReport, type PeriodKind } from '@/server/services/dashboard';

export const metadata: Metadata = { title: 'Báo cáo' };

const PERIODS: { key: PeriodKind; label: string; description: string }[] = [
  { key: 'week', label: 'Tuần', description: 'Kết quả, đúng hạn, tồn đọng và giờ thực tế của tuần.' },
  { key: 'month', label: 'Tháng', description: 'Xu hướng và phân rã theo đơn vị/người trong tháng.' },
  { key: 'year', label: 'Năm', description: 'Mục tiêu năm, đầu ra và tỷ lệ đúng hạn cả năm.' },
];

/**
 * Báo cáo kỳ — guideline 11.
 *
 * Toàn bộ số liệu lấy từ cùng `report service` với dashboard và export, nên ba nơi không thể
 * lệch nhau. Tỷ lệ đúng hạn luôn hiển thị kèm mẫu số; mẫu số 0 hiển thị “—”.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const user = await requireUser();
  if (!user.capabilities.has('report.view')) {
    return (
      <Alert tone="warning" title="Bạn không có quyền xem báo cáo">
        Liên hệ quản trị nếu cần cấp capability <code className="font-mono">report.view</code>.
      </Alert>
    );
  }

  const { period: periodParam, unit: unitId } = await searchParams;
  const period = (PERIODS.find((p) => p.key === periodParam)?.key ?? 'week') as PeriodKind;
  const [{ report, period: range }, units] = await Promise.all([
    getPeriodReport(user, period, undefined, { unitId }),
    listUnits(),
  ]);
  const selectedUnit = units.find((unit) => unit.id === unitId);

  const canExport = user.capabilities.has('report.export');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo kết quả"
        description={`Kỳ ${formatDateRange(range)}. ${selectedUnit ? `Đơn vị: ${selectedUnit.name}. ` : ''}Số liệu áp đúng phạm vi dữ liệu của bạn.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Chọn kỳ báo cáo" className="flex rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0.5">
              {PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/reports?period=${p.key}${unitId ? `&unit=${encodeURIComponent(unitId)}` : ''}`}
                  aria-current={p.key === period ? 'true' : undefined}
                  className={
                    p.key === period
                      ? 'rounded bg-[var(--brand-600)] px-3 py-1.5 text-xs font-medium text-white'
                      : 'rounded px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                  }
                >
                  {p.label}
                </Link>
              ))}
            </nav>
            {canExport ? (
              <ButtonLink
                href={`/api/exports/report?period=${period}${unitId ? `&unit=${encodeURIComponent(unitId)}` : ''}`}
                variant="secondary"
                size="sm"
                prefetch={false}
              >
                <FileDown aria-hidden className="size-4" />
                Xuất XLSX
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <Card>
        <form action="/reports" method="get" className="flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="period" value={period} />
          <label className="min-w-64 flex-1 text-xs text-[var(--text-muted)]">
            <span className="mb-1.5 block font-medium">Lọc báo cáo theo bộ phận</span>
            <Select name="unit" defaultValue={unitId ?? ''}>
              <option value="">Tất cả bộ phận trong phạm vi</option>
              {units.filter((unit) => unit.is_active).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="primary" size="sm">Áp dụng</Button>
          {unitId ? <ButtonLink href={`/reports?period=${period}`} variant="ghost" size="sm">Xóa bộ lọc</ButtonLink> : null}
        </form>
      </Card>

      <Alert tone={report.conclusion.confident ? 'info' : 'warning'} title="Kết luận quản trị">
        {report.conclusion.text}
        {!report.conclusion.confident ? (
          <>
            {' '}
            <Link href="/reports/data-health" className="font-medium underline">
              Xem chi tiết dữ liệu còn thiếu
            </Link>
          </>
        ) : null}
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <Stat label="Hoàn thành trong kỳ" value={formatInteger(report.totals.completed)} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Tỷ lệ đúng hạn"
              value={formatPercent(report.totals.on_time_rate)}
              hint={`Mẫu số ${formatInteger(report.totals.on_time + report.totals.late)} việc có đủ hạn và ngày thực tế`}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Giờ thực tế (định kỳ)"
              value={formatHours(report.totals.actual_hours)}
              hint="Chỉ cộng từ nhật ký thực hiện"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Đang quá hạn"
              value={formatInteger(report.totals.overdue_open)}
              tone={report.totals.overdue_open > 0 ? 'danger' : undefined}
              hint={`Trên ${formatInteger(report.totals.active_open)} việc đang mở`}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Công việc một lần"
            description="Hoàn thành theo ngày thực tế nằm trong kỳ. Cột “Thiếu ngày HT” là bản ghi đã đánh dấu hoàn thành nhưng chưa nhập ngày."
          />
          <CardBody>
            <table className="w-full text-sm">
              <caption className="sr-only">Công việc một lần theo lớp</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                  <th scope="col" className="pb-2 text-left font-semibold">Lớp</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Hoàn thành</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Đúng hạn</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Trễ</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Thiếu ngày HT</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.one_off.map((row) => (
                  <tr key={String(row.level)} className={row.level === 'TOTAL' ? 'font-semibold' : ''}>
                    <td className="py-2">{row.level === 'TOTAL' ? 'Tổng' : `Lớp ${row.level}`}</td>
                    <td className="tabular py-2 text-right">{formatInteger(row.completed)}</td>
                    <td className="tabular py-2 text-right text-[var(--tone-success-text)]">
                      {formatInteger(row.on_time)}
                    </td>
                    <td className="tabular py-2 text-right text-[var(--tone-danger-text)]">
                      {formatInteger(row.late)}
                    </td>
                    <td className="tabular py-2 text-right text-[var(--tone-warning-text)]">
                      {row.missing_completion_date > 0 ? formatInteger(row.missing_completion_date) : EMPTY}
                    </td>
                    <td className="tabular py-2 text-right">{formatPercent(row.on_time_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Công việc định kỳ / phát sinh"
            description="Tính từ nhật ký thực hiện trong kỳ, không suy ra từ trạng thái công việc cha."
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <SummaryRow label="Số kỳ hoàn thành" value={formatInteger(report.recurring.completed)} />
              <SummaryRow label="Tổng số kỳ ghi nhận" value={formatInteger(report.recurring.total)} />
              <SummaryRow
                label="Đúng hạn"
                value={formatInteger(report.recurring.on_time)}
                tone="success"
              />
              <SummaryRow label="Trễ hạn" value={formatInteger(report.recurring.late)} tone="danger" />
              <SummaryRow label="Đang thực hiện" value={formatInteger(report.recurring.in_progress)} />
              <SummaryRow label="Chưa thực hiện" value={formatInteger(report.recurring.not_done)} />
              <SummaryRow label="Bỏ qua (có lý do)" value={formatInteger(report.recurring.skipped)} />
              <SummaryRow label="Giờ thực tế" value={formatHours(report.recurring.actual_hours)} />
              <SummaryRow
                label="Tỷ lệ đúng hạn"
                value={formatPercent(report.recurring.on_time_rate)}
                hint={`Mẫu số ${formatInteger(report.recurring.on_time_denominator)}`}
              />
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={ShieldCheck}
          title="Nguyên tắc đọc báo cáo"
          description="Giữ nguyên tinh thần của Sheet nguồn."
        />
        <CardBody>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>Đọc theo ba trục: kết quả đạt được, đúng hạn và tải phân bổ.</li>
            <li>Không dùng riêng % hoàn thành để đánh giá con người.</li>
            <li>
              Thiếu tổng giờ, đơn vị phân bổ hoặc giờ/kỳ được coi là <strong>chưa đủ dữ liệu</strong>{' '}
              và không kết luận mức tải.
            </li>
            <li>Tỷ lệ đúng hạn hiển thị “—” khi mẫu số bằng 0, thay vì hiển thị 0%.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">{label}</dt>
      <dd
        className={
          tone === 'success'
            ? 'tabular text-base font-semibold text-[var(--tone-success-text)]'
            : tone === 'danger'
              ? 'tabular text-base font-semibold text-[var(--tone-danger-text)]'
              : 'tabular text-base font-semibold'
        }
      >
        {value}
        {hint ? (
          <span className="ml-1 text-[11px] font-normal text-[var(--text-subtle)]">{hint}</span>
        ) : null}
      </dd>
    </div>
  );
}
