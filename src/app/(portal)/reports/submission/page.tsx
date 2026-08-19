import type { Metadata } from 'next';
import Link from 'next/link';

import { formatDate, formatDateRange } from '@/domain/business-days';
import { formatHours, formatInteger, formatPercent } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listUnits } from '@/server/repositories/catalogs';
import { getPeriodReport, type PeriodKind } from '@/server/services/dashboard';

import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Tờ trình báo cáo công việc' };

const PERIOD_LABEL: Record<PeriodKind, string> = {
  week: 'tuần',
  month: 'tháng',
  year: 'năm',
  custom: 'kỳ tùy chọn',
};

export default async function SubmissionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const user = await requireUser();
  if (!user.capabilities.has('report.view')) return null;
  const { period: periodParam, unit: unitId } = await searchParams;
  const period = (['week', 'month', 'year'].includes(periodParam ?? '') ? periodParam : 'week') as PeriodKind;
  const [{ report, period: range }, units] = await Promise.all([
    getPeriodReport(user, period, undefined, { unitId }),
    listUnits(),
  ]);
  const selectedUnit = units.find((unit) => unit.id === unitId);
  const scopeName = selectedUnit?.name ?? (user.scope.all ? 'Toàn BOC' : user.unit?.name ?? 'Phạm vi được phân quyền');
  const [year, month, day] = range.end.split('-');

  return (
    <div className="space-y-4">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <Link href={`/reports?period=${period}${unitId ? `&unit=${encodeURIComponent(unitId)}` : ''}`} className="text-sm text-[var(--text-muted)] hover:underline">
          ← Quay lại báo cáo
        </Link>
        <PrintButton />
      </div>

      <article className="submission-report mx-auto w-full max-w-[210mm] bg-white px-[18mm] py-[15mm] text-[#171717] shadow-lg">
        <header className="grid grid-cols-2 gap-8 text-center text-[13px] leading-5">
          <div>
            <p className="font-semibold uppercase">Công ty Cổ phần Văn phòng phẩm Hồng Hà</p>
            <p className="font-bold uppercase">Ban Điều hành BOC</p>
            <div className="mx-auto mt-1 h-px w-24 bg-black" />
            <p className="mt-1">Số: ……/TTr-BOC</p>
          </div>
          <div>
            <p className="font-bold uppercase">Cộng hòa Xã hội Chủ nghĩa Việt Nam</p>
            <p className="font-bold">Độc lập - Tự do - Hạnh phúc</p>
            <div className="mx-auto mt-1 h-px w-32 bg-black" />
            <p className="mt-1 italic">Hà Nội, ngày {day} tháng {month} năm {year}</p>
          </div>
        </header>

        <div className="mt-9 text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide">Tờ trình</h1>
          <p className="mt-2 font-semibold">Về kết quả thực hiện công việc {PERIOD_LABEL[period]} ({formatDateRange(range)})</p>
        </div>

        <div className="mt-7 space-y-4 text-[14px] leading-6">
          <p><strong>Kính gửi:</strong> Ban Tổng Giám đốc Công ty</p>
          <p className="text-justify indent-8">
            Ban Điều hành BOC kính trình Ban Tổng Giám đốc báo cáo kết quả thực hiện công việc trong kỳ từ {formatDate(range.start)} đến {formatDate(range.end)}, phạm vi <strong>{scopeName}</strong>. Số liệu được tổng hợp từ BOC Control Tower theo quyền truy cập của người lập báo cáo.
          </p>

          <section>
            <h2 className="font-bold">I. Kết quả thực hiện</h2>
            <table className="mt-2 w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1.5 text-left">Chỉ tiêu</th>
                  <th className="w-28 border border-black px-2 py-1.5">Kết quả</th>
                  <th className="border border-black px-2 py-1.5 text-left">Ghi chú / mẫu số</th>
                </tr>
              </thead>
              <tbody>
                <ReportRow label="Công việc hoàn thành trong kỳ" value={formatInteger(report.totals.completed)} note="Theo ngày hoàn thành thực tế đã được xác nhận" />
                <ReportRow label="Hoàn thành đúng hạn" value={formatInteger(report.totals.on_time)} note={`Trễ hạn: ${formatInteger(report.totals.late)}`} />
                <ReportRow label="Tỷ lệ đúng hạn" value={formatPercent(report.totals.on_time_rate)} note={`Mẫu số ${formatInteger(report.totals.on_time + report.totals.late)} công việc đủ dữ liệu`} />
                <ReportRow label="Công việc đang mở" value={formatInteger(report.totals.active_open)} note={`Trong đó quá hạn: ${formatInteger(report.totals.overdue_open)}`} />
                <ReportRow label="Giờ thực tế công việc định kỳ" value={formatHours(report.totals.actual_hours)} note="Tổng hợp từ nhật ký thực hiện" />
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="font-bold">II. Đánh giá</h2>
            <p className="mt-1 text-justify indent-8">{report.conclusion.text}</p>
            {!report.conclusion.confident ? (
              <p className="mt-1 text-justify indent-8">Kết luận hiện chưa có độ tin cậy đầy đủ do còn bản ghi thiếu dữ liệu. Đề nghị hoàn thiện dữ liệu nguồn trước khi dùng để đánh giá cá nhân hoặc đơn vị.</p>
            ) : null}
          </section>

          <section>
            <h2 className="font-bold">III. Kiến nghị</h2>
            <ol className="mt-1 list-decimal space-y-1 pl-8 text-justify">
              <li>Chỉ đạo các đơn vị xử lý {formatInteger(report.totals.overdue_open)} công việc đang quá hạn và cập nhật kết quả trên hệ thống.</li>
              <li>Duy trì việc gửi kết quả hoàn thành bởi người thực hiện và xác nhận bởi người phụ trách trước khi chốt số liệu kỳ.</li>
              <li>Rà soát các bản ghi thiếu ngày, hạn, người thực hiện hoặc bằng chứng kết quả để bảo đảm chất lượng báo cáo.</li>
            </ol>
          </section>

          <p className="text-justify indent-8">Kính trình Ban Tổng Giám đốc xem xét và cho ý kiến chỉ đạo./.</p>
        </div>

        <footer className="mt-10 grid grid-cols-2 gap-12 text-center text-[13px]">
          <div>
            <p className="font-bold uppercase">Người lập tờ trình</p>
            <p className="italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
            <p className="font-semibold">{user.profile.full_name}</p>
          </div>
          <div>
            <p className="font-bold uppercase">Giám đốc BOC</p>
            <p className="italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
            <p className="font-semibold">………………………………</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function ReportRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <tr>
      <td className="border border-black px-2 py-1.5">{label}</td>
      <td className="border border-black px-2 py-1.5 text-center font-semibold">{value}</td>
      <td className="border border-black px-2 py-1.5">{note}</td>
    </tr>
  );
}
