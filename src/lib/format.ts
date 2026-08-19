import type { Tone } from '@/domain/catalogs';

/**
 * Định dạng hiển thị tiếng Việt — guideline 13.7.
 *
 * Quy ước xuyên suốt: **giá trị chưa có ≠ 0**. Mọi hàm ở đây trả `—` cho `null`/`undefined`
 * để màn hình không bao giờ khẳng định “0%” khi thực chất là “chưa có dữ liệu”.
 */

export const EMPTY = '—';

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return numberFormatter.format(value);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return integerFormatter.format(value);
}

/** Phần trăm 0–100. `null` ⇒ `—`, không phải `0%`. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return `${numberFormatter.format(value)}%`;
}

/** Giờ, tối đa 1 chữ số thập phân (guideline 13.7). */
export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return `${numberFormatter.format(value)}h`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

/** “2 giờ trước”, “hôm qua” — dùng cho dòng hoạt động. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return EMPTY;

  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return 'vừa xong';
}

/**
 * Nhãn deadline cho người dùng. Đầu vào luôn là `deadlineDaysAway`: hôm nay = 0, ngày làm việc
 * kế tiếp = 1 — cùng cách đếm với KPI Control Tower và bộ lọc “Còn 1–2 ngày”, để một công việc
 * không thể vừa nằm trong nhóm “đến hạn hôm nay” vừa hiện “Còn 1 ngày”.
 */
export function formatDaysLeft(days: number | null | undefined): string {
  if (days === null || days === undefined) return EMPTY;
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return 'Đến hạn hôm nay';
  return `Còn ${days} ngày`;
}

/** Lớp CSS theo tone ngữ nghĩa — dùng chung cho badge, chip, thanh tiến độ. */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-[var(--tone-neutral-bg)] border-[var(--tone-neutral-border)] text-[var(--tone-neutral-text)]',
  info: 'bg-[var(--tone-info-bg)] border-[var(--tone-info-border)] text-[var(--tone-info-text)]',
  progress:
    'bg-[var(--tone-progress-bg)] border-[var(--tone-progress-border)] text-[var(--tone-progress-text)]',
  success:
    'bg-[var(--tone-success-bg)] border-[var(--tone-success-border)] text-[var(--tone-success-text)]',
  warning:
    'bg-[var(--tone-warning-bg)] border-[var(--tone-warning-border)] text-[var(--tone-warning-text)]',
  danger: 'bg-[var(--tone-danger-bg)] border-[var(--tone-danger-border)] text-[var(--tone-danger-text)]',
  muted: 'bg-[var(--tone-muted-bg)] border-[var(--tone-muted-border)] text-[var(--tone-muted-text)]',
  strategic:
    'bg-[var(--tone-strategic-bg)] border-[var(--tone-strategic-border)] text-[var(--tone-strategic-text)]',
};

export const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-[var(--tone-neutral-text)]',
  info: 'bg-[var(--tone-info-text)]',
  progress: 'bg-[var(--tone-progress-text)]',
  success: 'bg-[var(--tone-success-text)]',
  warning: 'bg-[var(--tone-warning-text)]',
  danger: 'bg-[var(--tone-danger-text)]',
  muted: 'bg-[var(--tone-muted-text)]',
  strategic: 'bg-[var(--tone-strategic-text)]',
};

/** Chữ cái đầu để làm avatar khi chưa có ảnh. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[parts.length - 2][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
