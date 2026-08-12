import type { Metadata } from 'next';

import { Alert, Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { TableShell, Td, Th, Tr } from '@/components/ui/table';
import { countBusinessDays, formatDate, yearRange } from '@/domain/business-days';
import { formatInteger } from '@/lib/format';
import { requireCapability } from '@/server/auth/current-user';
import { listHolidays } from '@/server/repositories/catalogs';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Ngày nghỉ' };

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default async function AdminHolidaysPage() {
  await requireCapability('calendar.manage');

  const [holidays, ctx] = await Promise.all([listHolidays(), getBocContext()]);
  const unconfirmed = holidays.filter((h) => !h.is_confirmed);

  const years = [...new Set(holidays.map((h) => h.year))].sort();
  const workingDaysByYear = years.map((year) => {
    const range = yearRange(year);
    return { year, days: countBusinessDays(range.start, range.end, ctx.calendar) };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ngày nghỉ lễ"
        description="Danh sách này quyết định trực tiếp con số “còn bao nhiêu ngày làm việc” và mốc quá hạn trên toàn hệ thống."
      />

      {unconfirmed.length > 0 ? (
        <Alert tone="warning" title={`${unconfirmed.length} ngày nghỉ chưa được HR/BOC xác nhận`}>
          Sheet nguồn đánh dấu những ngày này là “tham chiếu”. Cho tới khi HR chốt lịch chính thức,
          mọi con số ngày làm việc còn lại đều có thể lệch. Đây là mục B7 trong danh sách
          NEED_CONFIRMATION.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {workingDaysByYear.map((row) => (
          <Card key={row.year}>
            <div className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                Ngày làm việc năm {row.year}
              </p>
              <p className="tabular mt-1 text-2xl font-semibold">{formatInteger(row.days)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Theo lịch {ctx.calendar.mask[6] ? 'Thứ 2 – Thứ 7' : 'Thứ 2 – Thứ 6'}, đã trừ ngày nghỉ
                đã khai báo
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title={`Danh sách ngày nghỉ (${holidays.length})`}
          description="Trích từ tab “Ngày nghỉ lễ” của Sheet nguồn, giữ nguyên ghi chú nguồn gốc."
        />
        <TableShell caption="Danh sách ngày nghỉ lễ">
          <thead>
            <tr>
              <Th sticky>Ngày</Th>
              <Th>Thứ</Th>
              <Th>Tên kỳ nghỉ</Th>
              <Th align="right">Năm</Th>
              <Th>Nguồn / ghi chú</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => {
              const weekday = new Date(`${holiday.holiday_date}T00:00:00Z`).getUTCDay();
              return (
                <Tr key={holiday.id}>
                  <Td sticky className="tabular text-sm">
                    {formatDate(holiday.holiday_date)}
                  </Td>
                  <Td className="text-xs text-[var(--text-muted)]">{WEEKDAY_LABELS[weekday]}</Td>
                  <Td>{holiday.name}</Td>
                  <Td align="right" className="text-xs">
                    {holiday.year}
                  </Td>
                  <Td className="text-xs text-[var(--text-muted)]">{holiday.source_note ?? '—'}</Td>
                  <Td>
                    <Badge tone={holiday.is_confirmed ? 'success' : 'warning'}>
                      {holiday.is_confirmed ? 'Đã xác nhận' : 'Chờ HR xác nhận'}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      </Card>
    </div>
  );
}
