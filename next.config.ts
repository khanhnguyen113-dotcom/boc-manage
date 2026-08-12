import type { NextConfig } from 'next';

/**
 * Header bảo mật theo guideline 16.1.
 *
 * `unsafe-inline` cho style là bắt buộc vì Next.js chèn style nội tuyến khi hydrate.
 * `frame-ancestors 'none'` chặn clickjacking — hệ thống nội bộ không được nhúng trong iframe
 * của bất kỳ trang nào. Ở production, `script-src` **không** có `unsafe-eval`.
 */
const isDevelopment = process.env.NODE_ENV !== 'production';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // React dev mode cần `eval()` để dựng lại callstack khi báo lỗi; production thì không.
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Bắt buộc cho image Docker nhỏ gọn (guideline 18.2).
  output: 'standalone',

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
