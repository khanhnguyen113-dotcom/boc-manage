import { ExternalLink } from 'lucide-react';

import { HTML_APP_SANDBOX } from '@/lib/html-apps';

export function HtmlAppFrame({
  source,
  title,
}: {
  source: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Đã bật tải Excel, cửa sổ in và lưu PDF trong vùng chạy cách ly.
          </p>
        </div>
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <ExternalLink aria-hidden className="size-3.5" />
          Mở tab riêng
        </a>
      </header>

      <iframe
        src={source}
        title={title}
        sandbox={HTML_APP_SANDBOX}
        referrerPolicy="no-referrer"
        className="block h-[calc(100dvh-13rem)] min-h-[42rem] w-full border-0 bg-white"
      />
    </section>
  );
}
