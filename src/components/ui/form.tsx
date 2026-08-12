'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';

import { Alert, Button } from './primitives';

/* Điều khiển form. Guideline 13.4/13.6: mỗi trường có label thật, mô tả trợ giúp,
   thông báo lỗi gắn với input bằng aria-describedby. */

const CONTROL =
  'w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm ' +
  'text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors ' +
  'hover:border-[var(--text-subtle)] disabled:cursor-not-allowed disabled:opacity-60 min-h-11 sm:min-h-10';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-[var(--text)]">
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--tone-danger-text)]" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-[11px] leading-4 text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-[11px] leading-4 text-[var(--tone-danger-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-20 resize-y py-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentPropsWithoutRef<'select'>) {
  return (
    <select className={cn(CONTROL, 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: ComponentPropsWithoutRef<'input'> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9">
      <input
        type="checkbox"
        className={cn(
          'size-4 rounded border-[var(--border-strong)] accent-[var(--brand-600)]',
          className,
        )}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

/** Nút submit hiển thị trạng thái đang gửi — tránh double submit. */
export function SubmitButton({
  children,
  pendingLabel = 'Đang lưu…',
  variant = 'primary',
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function FormError({
  message,
  details,
}: {
  message?: string | null;
  details?: { code: string; message: string }[];
}) {
  if (!message) return null;
  return (
    <Alert tone="danger" title={message}>
      {details && details.length > 0 ? (
        <ul className="list-inside list-disc space-y-0.5">
          {details.map((d) => (
            <li key={d.code}>{d.message}</li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}
