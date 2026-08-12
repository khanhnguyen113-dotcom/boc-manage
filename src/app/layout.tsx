import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';

import './globals.css';

/**
 * Be Vietnam Pro — font Việt hoá tốt, theo gợi ý guideline 13.2.
 * `next/font` tự self-host, không gọi Google ở runtime (đáp ứng CSP chặt).
 */
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

export const metadata: Metadata = {
  title: {
    default: 'BOC Control Tower',
    template: '%s · BOC Control Tower',
  },
  description:
    'Trung tâm Điều hành Công việc BOC — Công ty Cổ phần Văn phòng phẩm Hồng Hà. Quản trị công việc, tiến độ, nguồn lực và báo cáo nội bộ.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="min-h-dvh antialiased">
        <a href="#noi-dung-chinh" className="skip-link">
          Bỏ qua điều hướng
        </a>
        {children}
      </body>
    </html>
  );
}
