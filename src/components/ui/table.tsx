import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatInteger } from '@/lib/format';

/**
 * Khung bảng dữ liệu (ADR-011/ADR-014).
 *
 * - Header dính khi cuộn dọc, cột đầu dính khi cuộn ngang.
 * - Sort/phân trang là **link đổi URL**, không phải state client — chia sẻ được và
 *   back/forward hoạt động đúng.
 * - Bảng luôn là `<table>` ngữ nghĩa với `<caption>` ẩn cho screen reader.
 */

export function TableShell({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[64rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  sticky,
  className,
  width,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
  className?: string;
  width?: string;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        'sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5',
        'text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        sticky && 'left-0 z-20',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  sticky,
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'border-b border-[var(--border)] px-3 py-2.5 align-middle text-[var(--text)]',
        align === 'right' && 'text-right tabular',
        align === 'center' && 'text-center',
        sticky && 'sticky left-0 bg-[var(--surface)] group-hover:bg-[var(--surface-hover)]',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn('group transition-colors hover:bg-[var(--surface-hover)]', className)}>
      {children}
    </tr>
  );
}

/** Tiêu đề cột bấm được để đổi sắp xếp — chỉ đổi query string. */
export function SortHeader({
  children,
  field,
  currentSort,
  currentDir,
  baseParams,
  align,
}: {
  children: ReactNode;
  field: string;
  currentSort: string | undefined;
  currentDir: 'asc' | 'desc';
  baseParams: URLSearchParams;
  align?: 'left' | 'right' | 'center';
}) {
  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === 'asc' ? 'desc' : 'asc';
  const params = new URLSearchParams(baseParams);
  params.set('sort', field);
  params.set('dir', nextDir);
  params.delete('page');

  return (
    <Th align={align}>
      <Link
        href={`?${params.toString()}`}
        className={cn(
          'inline-flex items-center gap-1 hover:text-[var(--text)]',
          isActive && 'text-[var(--text)]',
        )}
        aria-label={`Sắp xếp theo ${String(children)} ${nextDir === 'asc' ? 'tăng dần' : 'giảm dần'}`}
      >
        {children}
        <span aria-hidden className="text-[9px] leading-none">
          {isActive ? (currentDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </Link>
    </Th>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  baseParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  baseParams: URLSearchParams;
}) {
  const hrefFor = (target: number) => {
    const params = new URLSearchParams(baseParams);
    params.set('page', String(target));
    return `?${params.toString()}`;
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Phân trang"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]"
    >
      <p className="tabular">
        {formatInteger(from)}–{formatInteger(to)} trên {formatInteger(total)} bản ghi
      </p>

      <div className="flex items-center gap-2">
        <div className="mr-2 flex items-center gap-1">
          <span className="text-[var(--text-subtle)]">Số dòng</span>
          {[25, 50, 100].map((size) => {
            const params = new URLSearchParams(baseParams);
            params.set('pageSize', String(size));
            params.delete('page');
            return (
              <Link
                key={size}
                href={`?${params.toString()}`}
                className={cn(
                  'rounded px-1.5 py-0.5 tabular',
                  size === pageSize
                    ? 'bg-[var(--brand-600)] text-white'
                    : 'hover:bg-[var(--surface-hover)]',
                )}
              >
                {size}
              </Link>
            );
          })}
        </div>

        <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="Trang trước">
          <ChevronLeft aria-hidden className="size-4" />
        </PageLink>
        <span className="tabular px-1">
          {page} / {pageCount}
        </span>
        <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount} label="Trang sau">
          <ChevronRight aria-hidden className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className="inline-flex size-8 items-center justify-center rounded border border-[var(--border)] opacity-40"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded border border-[var(--border)] hover:bg-[var(--surface-hover)]"
    >
      {children}
    </Link>
  );
}
