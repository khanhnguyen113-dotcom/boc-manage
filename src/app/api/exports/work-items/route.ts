import { NextResponse, type NextRequest } from 'next/server';

import { buildDerivedFilter, parseFilters, type SearchParams } from '@/app/(portal)/work-items/filters';
import { getSessionUser } from '@/server/auth/current-user';
import { searchWorkItems } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';
import { exportWorkItems } from '@/server/services/export';

/**
 * Export danh sách công việc.
 *
 * Áp **đúng** scope và bộ lọc như màn hình đang xem (guideline 11.4), nên file tải về không thể
 * chứa dữ liệu người dùng không được xem. Mọi lần tải đều ghi audit.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Chưa đăng nhập', { status: 401 });
  if (!user.capabilities.has('report.export')) {
    return new NextResponse('Không có quyền xuất báo cáo', { status: 403 });
  }

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = parseFilters(params);
  const ctx = await getBocContext();

  // Export lấy toàn bộ kết quả khớp bộ lọc, không giới hạn theo trang đang xem.
  const page = await searchWorkItems(
    { ...parsed.query, page: 1, pageSize: 10_000 },
    user.scope,
    buildDerivedFilter(parsed, ctx),
  );

  const { buffer, filename, recordCount } = await exportWorkItems(user, page.rows, ctx, params);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
      'X-Record-Count': String(recordCount),
      'Cache-Control': 'no-store',
    },
  });
}
