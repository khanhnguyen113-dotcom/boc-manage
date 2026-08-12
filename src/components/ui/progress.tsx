import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

import type { Kpi } from '@/domain/metrics';
import { cn } from '@/lib/cn';
import { EMPTY, formatHours, formatInteger, formatPercent } from '@/lib/format';

/* Thanh tiến độ + thẻ KPI. Cả hai đều phải xử lý `null` = “chưa có dữ liệu”. */

export function ProgressBar({
  value,
  size = 'md',
  showLabel = true,
  className,
}: {
  value: number | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(value);
  const pct = hasValue ? Math.min(100, Math.max(0, value)) : 0;

  const tone =
    !hasValue
      ? 'bg-[var(--border-strong)]'
      : pct >= 100
        ? 'bg-[var(--tone-success-text)]'
        : pct >= 50
          ? 'bg-[var(--tone-progress-text)]'
          : pct > 0
            ? 'bg-[var(--tone-info-text)]'
            : 'bg-[var(--border-strong)]';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuenow={hasValue ? pct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={hasValue ? `Tiến độ ${pct}%` : 'Chưa có dữ liệu tiến độ'}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
      >
        {hasValue ? (
          <span
            className={cn('absolute inset-y-0 left-0 rounded-full transition-[width]', tone)}
            style={{ width: `${pct}%` }}
          />
        ) : (
          // Gạch chéo nhạt: nhìn là biết “chưa có số”, khác hẳn thanh 0%.
          <span
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, var(--border-strong) 0 4px, transparent 4px 8px)',
            }}
          />
        )}
      </div>
      {showLabel ? (
        <span
          className={cn(
            'tabular w-11 shrink-0 text-right text-xs',
            hasValue ? 'text-[var(--text-muted)]' : 'text-[var(--text-subtle)]',
          )}
        >
          {hasValue ? `${Math.round(pct)}%` : EMPTY}
        </span>
      ) : null}
    </div>
  );
}

function formatKpi(kpi: Kpi): string {
  switch (kpi.format) {
    case 'percent':
      return formatPercent(kpi.value);
    case 'hours':
      return formatHours(kpi.value);
    default:
      return formatInteger(kpi.value);
  }
}

/**
 * Thẻ KPI — guideline 13.4: số chính + định nghĩa + chất lượng dữ liệu + drill-down.
 * KPI không truy vết được thì không hiển thị, nên `href` là bắt buộc.
 */
export function KpiCard({
  kpi,
  href,
  icon: Icon,
  emphasis,
}: {
  kpi: Kpi;
  href: string;
  icon?: LucideIcon;
  emphasis?: 'danger' | 'warning' | 'success';
}) {
  const hasValue = kpi.value !== null && kpi.value !== undefined;

  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4',
        'shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase leading-4 tracking-wide text-[var(--text-subtle)]">
          {kpi.label}
        </p>
        {Icon ? (
          <Icon
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-[var(--text-subtle)]',
              emphasis === 'danger' && 'text-[var(--tone-danger-text)]',
              emphasis === 'warning' && 'text-[var(--tone-warning-text)]',
              emphasis === 'success' && 'text-[var(--tone-success-text)]',
            )}
          />
        ) : null}
      </div>

      <p
        className={cn(
          'tabular text-2xl font-semibold leading-none tracking-tight',
          !hasValue && 'text-[var(--text-subtle)]',
          emphasis === 'danger' && hasValue && 'text-[var(--tone-danger-text)]',
          emphasis === 'warning' && hasValue && 'text-[var(--tone-warning-text)]',
        )}
      >
        {formatKpi(kpi)}
      </p>

      <p className="text-[11px] leading-4 text-[var(--text-muted)]">{kpi.hint}</p>

      {kpi.excluded_count > 0 ? (
        <p className="text-[11px] leading-4 text-[var(--text-subtle)]">
          Đã loại {formatInteger(kpi.excluded_count)} bản ghi
          {kpi.exclusion_reasons.length > 0 ? `: ${kpi.exclusion_reasons.join(' · ')}` : ''}
        </p>
      ) : null}

      <ArrowUpRight
        aria-hidden
        className="absolute right-3 bottom-3 size-3.5 text-[var(--text-subtle)] opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}
