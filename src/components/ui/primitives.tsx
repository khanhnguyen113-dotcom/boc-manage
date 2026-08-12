import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, ShieldAlert, type LucideIcon } from 'lucide-react';

import type { Tone } from '@/domain/catalogs';
import { cn } from '@/lib/cn';
import { TONE_CLASS } from '@/lib/format';

/* ===========================================================================
   Primitive dùng chung. Theo tinh thần shadcn/ui nhưng viết tay (ADR-011):
   Tailwind + token màu, không phụ thuộc runtime bên ngoài.
   =========================================================================== */

// --- Card --------------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--text)]">
          {Icon ? <Icon aria-hidden className="size-4 text-[var(--text-muted)]" /> : null}
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

// --- Button ------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border font-medium transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)] shadow-[var(--shadow-sm)]',
  secondary:
    'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]',
  subtle:
    'border-transparent bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--surface-hover)]',
  ghost: 'border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
  danger:
    'border-transparent bg-[var(--tone-danger-text)] text-white hover:opacity-90 shadow-[var(--shadow-sm)]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // Touch target ≥ 44px trên mobile (guideline 13.5) nhờ min-h.
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm sm:min-h-10',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

// --- Badge & chip ------------------------------------------------------------

/**
 * Guideline 13.4: badge trạng thái **không bao giờ chỉ dùng màu** — luôn có nhãn chữ,
 * và tuỳ chọn thêm icon.
 */
export function Badge({
  tone = 'neutral',
  children,
  icon: Icon,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3" /> : null}
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 rounded-full border', TONE_CLASS[tone])}
    />
  );
}

// --- Alert -------------------------------------------------------------------

const ALERT_ICONS: Record<'info' | 'warning' | 'danger', LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div
      role={tone === 'info' ? 'note' : 'alert'}
      className={cn(
        'flex gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm',
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

// --- Trạng thái rỗng / đang tải / bị chặn -------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-xs leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[var(--radius-sm)]', className)} />;
}

export function PermissionDenied({ capability }: { capability?: string }) {
  return (
    <Alert tone="warning" title="Bạn không có quyền xem nội dung này">
      Liên hệ quản trị hệ thống nếu bạn cho rằng đây là nhầm lẫn.
      {capability ? (
        <span className="ml-1 font-mono text-[11px] opacity-80">({capability})</span>
      ) : null}
    </Alert>
  );
}

// --- Bố cục ------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {breadcrumb}
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  as: As = 'div',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  as?: ElementType;
}) {
  return (
    <As className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        {label}
      </p>
      <p
        className={cn(
          'tabular text-lg font-semibold text-[var(--text)]',
          tone === 'danger' && 'text-[var(--tone-danger-text)]',
          tone === 'warning' && 'text-[var(--tone-warning-text)]',
          tone === 'success' && 'text-[var(--tone-success-text)]',
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-[var(--text-muted)]">{hint}</p> : null}
    </As>
  );
}
