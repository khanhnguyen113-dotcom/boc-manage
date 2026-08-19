import { describe, expect, it } from 'vitest';

import {
  HTML_APP_SANDBOX_TOKENS,
  parseHtmlAppAllowedOrigins,
  resolveHtmlAppSource,
} from '@/lib/html-apps';

describe('HTML app iframe policy', () => {
  it('cấp đủ quyền tải Excel và in PDF nhưng không cấp same-origin', () => {
    expect(HTML_APP_SANDBOX_TOKENS).toEqual(
      expect.arrayContaining([
        'allow-scripts',
        'allow-downloads',
        'allow-modals',
        'allow-popups',
        'allow-popups-to-escape-sandbox',
      ]),
    );
    expect(HTML_APP_SANDBOX_TOKENS).not.toContain('allow-same-origin');
  });

  it('chuẩn hóa và loại cấu hình origin không an toàn', () => {
    expect(
      parseHtmlAppAllowedOrigins(
        'https://html-apps.example.vn/path, http://localhost:8080, javascript:alert(1), https://html-apps.example.vn',
      ),
    ).toEqual(['https://html-apps.example.vn', 'http://localhost:8080']);
  });

  it('chỉ nhận vùng publish nội bộ hoặc origin đã cho phép', () => {
    const origins = ['https://html-apps.example.vn'];

    expect(resolveHtmlAppSource('/published-html-apps/cong-cu/index.html', origins)).toBe(
      '/published-html-apps/cong-cu/index.html',
    );
    expect(resolveHtmlAppSource('https://html-apps.example.vn/cong-cu.html', origins)).toBe(
      'https://html-apps.example.vn/cong-cu.html',
    );
    expect(resolveHtmlAppSource('https://khong-duoc-phep.example/cong-cu.html', origins)).toBeNull();
    expect(resolveHtmlAppSource('javascript:alert(1)', origins)).toBeNull();
    expect(resolveHtmlAppSource('data:text/html,<script>alert(1)</script>', origins)).toBeNull();
    expect(resolveHtmlAppSource('//html-apps.example.vn/cong-cu.html', origins)).toBeNull();
  });
});
