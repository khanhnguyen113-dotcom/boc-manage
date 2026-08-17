import { NextResponse, type NextRequest } from 'next/server';

import { getSessionUser } from '@/server/auth/current-user';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';
import { getPeriodReport, type PeriodKind } from '@/server/services/dashboard';
import { exportWorkItems } from '@/server/services/export';
import { isWithin } from '@/domain/business-days';

/**
 * Export báo cáo kỳ: gồm các bản ghi thực sự tạo nên con số của kỳ (hoàn thành trong kỳ + việc
 * đang mở), để người nhận file đối soát được từng dòng.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Chưa đăng nhập', { status: 401 });
  if (!user.capabilities.has('report.export')) {
    return new NextResponse('Không có quyền xuất báo cáo', { status: 403 });
  }

  const periodParam = request.nextUrl.searchParams.get('period');
  const period = (['week', 'month', 'year'].includes(periodParam ?? '')
    ? periodParam
    : 'week') as PeriodKind;
  const unitId = request.nextUrl.searchParams.get('unit') || undefined;

  const [{ period: range }, ctx, items] = await Promise.all([
    getPeriodReport(user, period, undefined, { unitId }),
    getBocContext(),
    listWorkItemsInScope(user.scope),
  ]);

  const relevant = items.filter(
    (item) =>
      (!unitId || item.owning_unit_id === unitId) &&
      (isWithin(item.completed_at, range) ||
        (item.status !== 'COMPLETED' && item.status !== 'CANCELLED' && !item.is_archived)),
  );

  const { buffer, filename } = await exportWorkItems(user, relevant, ctx, {
    report: period,
    from: range.start,
    to: range.end,
    unit: unitId,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace('CongViec', `BaoCao_${period}`)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
