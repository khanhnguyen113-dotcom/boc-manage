import type { NextConfig } from 'next';

/**
 * Header bảo mật theo guideline 16.1.
 *
 * `unsafe-inline` cho style là bắt buộc vì Next.js chèn style nội tuyến khi hydrate.
 * `frame-ancestors 'none'` chặn clickjacking — hệ thống nội bộ không được nhúng trong iframe
 * của bất kỳ trang nào. Ở production, `script-src` **không** có `unsafe-eval`.
 */
const isDevelopment = process.env.NODE_ENV !== 'production';

/** Chỉ đưa origin HTTP(S) hợp lệ từ cấu hình vào CSP. */
function htmlAppFrameSources(value: string | undefined): string[] {
  if (!value) return [];

  const origins = new Set<string>();
  for (const candidate of value.split(',')) {
    try {
      const url = new URL(candidate.trim());
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
        origins.add(url.origin);
      }
    } catch {
      // Bỏ qua cấu hình sai, không ghép chuỗi chưa kiểm soát vào security header.
    }
  }
  return [...origins];
}

const HTML_APP_FRAME_SOURCES = htmlAppFrameSources(process.env.HTML_APP_ALLOWED_ORIGINS);

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // React dev mode cần `eval()` để dựng lại callstack khi báo lỗi; production thì không.
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // `blob:` hỗ trợ viewer tạo object URL; origin ngoài phải khai báo rõ trên Dokploy.
  `frame-src 'self' blob:${HTML_APP_FRAME_SOURCES.length ? ` ${HTML_APP_FRAME_SOURCES.join(' ')}` : ''}`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Bắt buộc cho image Docker nhỏ gọn (guideline 18.2).
  output: 'standalone',

  // Các package này chỉ chạy trong mã server Node.js. Không bundle chúng vào server chunks:
  // ExcelJS và Appwrite/Undici có cây phụ thuộc lớn, làm compiler tốn CPU/RAM vô ích trên VPS.
  // Output File Tracing của standalone vẫn chép đúng package runtime vào image.
  serverExternalPackages: ['exceljs', 'node-appwrite', 'undici'],

  experimental: {
    // Dokploy build ngay trên VPS. Giữ một worker để deployment không chiếm hết CPU/RAM và làm
    // nghẽn các container đang phục vụ người dùng. Có thể chậm hơn một chút nhưng ổn định hơn.
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 25,

    // Webpack là bundler production có chế độ tối ưu bộ nhớ chính thức của Next.js. Tách compiler
    // vào worker để bộ nhớ được giải phóng ngay sau pha compile; không chạy các pha nặng song song.
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
  },

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
