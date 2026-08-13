'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PanelLeftClose, Plus, X } from 'lucide-react';

import { NAV_ICONS, type NavItem } from '@/config/navigation';
import { cn } from '@/lib/cn';

/**
 * Điều hướng chính. Thu gọn được trên desktop (guideline 13.3), chuyển thành drawer
 * trên mobile. Danh sách mục đã được **lọc theo quyền ở server** — client chỉ vẽ.
 */
export function Sidebar({
  mainNav,
  adminNav,
  unreadCount,
  canCreateWork,
}: {
  mainNav: NavItem[];
  adminNav: NavItem[];
  unreadCount: number;
  canCreateWork: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (item: NavItem) =>
    item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href;

  const nav = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Điều hướng chính">
      {canCreateWork ? (
        <Link
          href="/work-items/new"
          onClick={() => setMobileOpen(false)}
          title={collapsed ? 'Tạo công việc' : 'Mở khu vực nhập công việc tập trung'}
          className={cn(
            'flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--brand-600)] px-3 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-sm)] hover:bg-[var(--brand-700)]',
            collapsed && 'px-0',
          )}
        >
          <Plus aria-hidden className="size-4" />
          {!collapsed ? 'Tạo công việc' : null}
        </Link>
      ) : null}

      <Section
        items={mainNav}
        collapsed={collapsed}
        isActive={isActive}
        unreadCount={unreadCount}
        onNavigate={() => setMobileOpen(false)}
      />

      {adminNav.length > 0 ? (
        <Section
          title="Quản trị"
          items={adminNav}
          collapsed={collapsed}
          isActive={isActive}
          unreadCount={0}
          onNavigate={() => setMobileOpen(false)}
        />
      ) : null}
    </nav>
  );

  return (
    <>
      {/* Nút mở menu trên mobile */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu"
        aria-expanded={mobileOpen}
        className="fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-[var(--brand-600)] text-white shadow-[var(--shadow-lg)] lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="animate-in absolute inset-y-0 left-0 w-72 border-r border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <BrandMark collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Đóng menu"
                className="rounded p-1 hover:bg-[var(--surface-hover)]"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}

      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 border-b border-[var(--border)] px-3 py-4',
            collapsed && 'justify-center px-0',
          )}
        >
          <BrandMark collapsed={collapsed} />
        </div>

        {nav}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="m-3 flex items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          <PanelLeftClose
            aria-hidden
            className={cn('size-4 transition-transform', collapsed && 'rotate-180')}
          />
          {!collapsed && 'Thu gọn'}
        </button>
      </aside>
    </>
  );
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--brand-600)] text-sm font-bold text-white">
        HH
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">BOC Control Tower</span>
          <span className="block text-[11px] leading-tight text-[var(--text-subtle)]">
            Văn phòng phẩm Hồng Hà
          </span>
        </span>
      ) : null}
    </Link>
  );
}

function Section({
  title,
  items,
  collapsed,
  isActive,
  unreadCount,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  collapsed: boolean;
  isActive: (item: NavItem) => boolean;
  unreadCount: number;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-1">
      {title && !collapsed ? (
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {title}
        </p>
      ) : null}

      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = isActive(item);
        const badge = item.href === '/notifications' && unreadCount > 0 ? unreadCount : null;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : item.description}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-[var(--brand-50)] font-medium text-[var(--brand-700)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-200)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
            {badge !== null ? (
              <span
                className={cn(
                  'tabular rounded-full bg-[var(--brand-600)] px-1.5 py-0.5 text-[10px] font-semibold text-white',
                  collapsed && 'absolute',
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
