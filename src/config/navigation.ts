import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  GitBranch,
  LayoutDashboard,
  ListTree,
  Settings2,
  Users2,
} from 'lucide-react';

import type { Capability } from '@/domain/permissions';

/** Menu chính — guideline 5.1. Mỗi mục gắn capability tối thiểu để hiển thị. */

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof NAV_ICONS;
  capability: Capability;
  /** Khớp cả route con, ví dụ `/work-items/abc`. */
  matchPrefix?: boolean;
  description: string;
}

export const NAV_ICONS = {
  LayoutDashboard,
  ClipboardList,
  GitBranch,
  ListTree,
  CalendarDays,
  Users2,
  BarChart3,
  Bell,
  Settings2,
} as const;

export const MAIN_NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Tổng quan',
    icon: 'LayoutDashboard',
    capability: 'portal.access',
    description: 'Control Tower: việc cần can thiệp, deadline, tải và chất lượng dữ liệu',
  },
  {
    href: '/my-work',
    label: 'Việc của tôi',
    icon: 'ClipboardList',
    capability: 'work.view',
    description: 'Hôm nay, quá hạn, P1, cần cập nhật, định kỳ đến kỳ',
  },
  {
    href: '/work-map',
    label: 'Bản đồ công việc',
    icon: 'GitBranch',
    capability: 'work.view',
    description: 'Cây phân rã từ L3, mặc định tập trung đến L5 và có thể sâu hơn',
  },
  {
    href: '/work-items',
    label: 'Tất cả công việc',
    icon: 'ListTree',
    capability: 'work.view',
    matchPrefix: true,
    description: 'Bảng dữ liệu đầy đủ, lọc và tìm kiếm',
  },
  {
    href: '/workload',
    label: 'Sức Tải',
    icon: 'Users2',
    capability: 'work.view',
    description: 'Tải theo người, công suất và giờ tồn',
  },
  {
    href: '/reports',
    label: 'Báo cáo',
    icon: 'BarChart3',
    capability: 'report.view',
    matchPrefix: true,
    description: 'Ngày, tuần, tháng, năm và chất lượng dữ liệu',
  },
  {
    href: '/notifications',
    label: 'Thông báo',
    icon: 'Bell',
    capability: 'portal.access',
    description: 'Giao việc, deadline, mention và thay đổi quan trọng',
  },
  {
    href: '/calendar',
    label: 'Lịch & deadline',
    icon: 'CalendarDays',
    capability: 'work.view',
    description: 'Lịch hạn hoàn thành và ngày nghỉ',
  },
];

export const ADMIN_NAV: NavItem[] = [
  {
    href: '/admin/users',
    label: 'Người dùng & phân quyền',
    icon: 'Users2',
    capability: 'user.manage',
    matchPrefix: true,
    description: 'Hồ sơ, vai trò, capability và phạm vi dữ liệu',
  },
  {
    href: '/admin/organization',
    label: 'Cơ cấu đơn vị',
    icon: 'GitBranch',
    capability: 'organization.manage',
    description: 'Đơn vị, quan hệ quản lý và công suất',
  },
  {
    href: '/admin/catalogs',
    label: 'Danh mục',
    icon: 'ListTree',
    capability: 'catalog.manage',
    description: 'Lớp 1, Lớp 2 và các danh mục dùng chung',
  },
  {
    href: '/admin/holidays',
    label: 'Ngày nghỉ',
    icon: 'CalendarDays',
    capability: 'calendar.manage',
    description: 'Lịch nghỉ lễ ảnh hưởng trực tiếp tới deadline',
  },
  {
    href: '/admin/settings',
    label: 'Tham số hệ thống',
    icon: 'Settings2',
    capability: 'settings.manage',
    description: 'Ngưỡng tải, lịch làm việc, cách cuộn tiến độ',
  },
  {
    href: '/admin/imports',
    label: 'Import & đối soát',
    icon: 'ClipboardList',
    capability: 'import.execute',
    description: 'Nhập dữ liệu từ Google Sheet, dry-run và biên bản lỗi',
  },
  {
    href: '/admin/audit',
    label: 'Audit log',
    icon: 'BarChart3',
    capability: 'audit.view',
    description: 'Lịch sử thay đổi không sửa được',
  },
];
