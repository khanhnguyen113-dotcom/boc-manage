import Link from 'next/link';
import { Bell, CalendarClock, LogOut } from 'lucide-react';

import { logoutAction } from '@/app/(auth)/login/actions';
import { Badge } from '@/components/ui/primitives';
import { ROLE_LABELS } from '@/domain/catalogs';
import type { RoleCode } from '@/domain/types';
import { initials } from '@/lib/format';
import { formatDate } from '@/domain/business-days';
import { ThemeToggle } from './theme-toggle';

/**
 * Thanh trên: ngày nghiệp vụ đang áp dụng, thông báo chưa đọc và hồ sơ.
 *
 * Ngày nghiệp vụ hiển thị công khai vì mọi con số “quá hạn / còn N ngày” đều tính theo nó —
 * người dùng cần biết hệ thống đang lấy mốc nào (guideline mục 10).
 */
export function Topbar({
  fullName,
  jobTitle,
  unitName,
  roles,
  unreadCount,
  businessDate,
  avatarColor,
}: {
  fullName: string;
  jobTitle: string | null;
  unitName: string;
  roles: RoleCode[];
  unreadCount: number;
  businessDate: string;
  avatarColor: string | null;
}) {
  const tone = (
    {
      brand: 'bg-[var(--brand-600)] text-white',
      info: 'bg-[var(--tone-info-text)] text-white',
      success: 'bg-[var(--tone-success-text)] text-white',
      warning: 'bg-[var(--tone-warning-text)] text-white',
      strategic: 'bg-[var(--tone-strategic-text)] text-white',
      progress: 'bg-[var(--tone-progress-text)] text-white',
      muted: 'bg-[var(--tone-neutral-text)] text-white',
    } as Record<string, string>
  )[avatarColor ?? 'brand'];

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]">
          <CalendarClock aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            Ngày nghiệp vụ <strong className="font-semibold text-[var(--text)]">{formatDate(businessDate)}</strong>
            <span className="hidden sm:inline"> · Asia/Ho_Chi_Minh</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />

          <Link
            href="/notifications"
            className="relative rounded-[var(--radius)] p-2 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-label={
              unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo, không có mới'
            }
          >
            <Bell aria-hidden className="size-4" />
            {unreadCount > 0 ? (
              <span className="tabular absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--brand-600)] px-1 text-[10px] font-semibold leading-4 text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Link>

          <Link
            href="/profile"
            className="flex items-center gap-2.5 rounded-[var(--radius)] px-2 py-1.5 hover:bg-[var(--surface-hover)]"
          >
            <span
              aria-hidden
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`}
            >
              {initials(fullName)}
            </span>
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block truncate text-xs font-medium leading-tight">{fullName}</span>
              <span className="block truncate text-[11px] leading-tight text-[var(--text-subtle)]">
                {jobTitle ?? unitName}
              </span>
            </span>
          </Link>

          <div className="hidden lg:block">
            {roles.slice(0, 1).map((role) => (
              <Badge key={role} tone="neutral">
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-[var(--radius)] p-2 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--tone-danger-text)]"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut aria-hidden className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
