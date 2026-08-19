/**
 * Quyền tối thiểu cho ứng dụng HTML chạy trong iframe.
 *
 * Không cấp `allow-same-origin`: HTML do người dùng tải lên không được phép mang origin
 * của BOC, đọc cookie hay truy cập DOM của cổng quản trị. Excel/PDF không cần quyền đó.
 */
export const HTML_APP_SANDBOX_TOKENS = [
  'allow-scripts',
  'allow-forms',
  'allow-downloads',
  'allow-modals',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
] as const;

export const HTML_APP_SANDBOX = HTML_APP_SANDBOX_TOKENS.join(' ');

/** Chuẩn hóa danh sách origin, phân cách bằng dấu phẩy, dùng cho CSP và viewer. */
export function parseHtmlAppAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];

  const origins = new Set<string>();
  for (const candidate of value.split(',')) {
    try {
      const url = new URL(candidate.trim());
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
        origins.add(url.origin);
      }
    } catch {
      // Bỏ qua cấu hình sai thay vì đưa chuỗi không kiểm soát vào CSP.
    }
  }
  return [...origins];
}

/**
 * Chỉ cho viewer mở nội dung từ vùng publish nội bộ hoặc origin đã được quản trị cho phép.
 * Không nhận `srcdoc`, data URL, javascript URL hay URL dạng protocol-relative.
 */
export function resolveHtmlAppSource(
  source: string | undefined,
  allowedOrigins: readonly string[],
): string | null {
  const value = source?.trim();
  if (!value || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return null;

  if (value.startsWith('/published-html-apps/') && !value.startsWith('//')) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!allowedOrigins.includes(url.origin)) return null;
    return url.href;
  } catch {
    return null;
  }
}
