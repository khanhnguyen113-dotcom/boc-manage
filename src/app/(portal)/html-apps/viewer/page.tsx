import type { Metadata } from 'next';

import { HtmlAppFrame } from '@/components/html-apps/html-app-frame';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { parseHtmlAppAllowedOrigins, resolveHtmlAppSource } from '@/lib/html-apps';
import { requireCapability } from '@/server/auth/current-user';

export const metadata: Metadata = { title: 'Ứng dụng HTML' };

type ViewerSearchParams = {
  src?: string | string[];
  title?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Điểm vào dùng chung cho danh sách ứng dụng đã publish:
 * `/html-apps/viewer?src=<url>&title=<tên ứng dụng>`.
 */
export default async function HtmlAppViewerPage({
  searchParams,
}: {
  searchParams: Promise<ViewerSearchParams>;
}) {
  await requireCapability('portal.access');

  const query = await searchParams;
  const requestedSource = first(query.src);
  const allowedOrigins = parseHtmlAppAllowedOrigins(process.env.HTML_APP_ALLOWED_ORIGINS);
  const source = resolveHtmlAppSource(requestedSource, allowedOrigins);
  const title = (first(query.title)?.trim() || 'Ứng dụng HTML').slice(0, 120);

  if (!requestedSource) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Ứng dụng HTML"
          description="Vùng chạy cách ly dành cho ứng dụng HTML đã được upload và publish."
        />
        <Card>
          <EmptyState
            title="Chưa chọn ứng dụng"
            description="Mở ứng dụng từ danh sách đã publish để hệ thống truyền đường dẫn vào viewer."
          />
        </Card>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="space-y-5">
        <PageHeader title="Không thể mở ứng dụng HTML" />
        <Alert tone="danger" title="Nguồn ứng dụng chưa được cho phép">
          Chỉ nội dung trong <code>/published-html-apps/</code> hoặc tên miền được khai báo bằng
          biến <code>HTML_APP_ALLOWED_ORIGINS</code> mới được chạy trong hệ thống.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description="Ứng dụng chạy trong iframe cách ly và được cấp quyền xuất file, in hoặc lưu PDF."
      />
      <HtmlAppFrame source={source} title={title} />
    </div>
  );
}
