import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { ADMIN_NAV, MAIN_NAV } from '@/config/navigation';
import { requireUser } from '@/server/auth/current-user';
import { countUnreadNotifications } from '@/server/repositories/collaboration';
import { getBocContext } from '@/server/services/context';

/**
 * Vỏ ứng dụng cho mọi trang đã đăng nhập.
 *
 * Lọc menu theo capability **tại server**: mục không có quyền thì không tồn tại trong HTML,
 * chứ không phải ẩn bằng CSS. Đây chỉ là tiện ích hiển thị — mỗi trang vẫn tự kiểm quyền
 * (ADR-004).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unreadCount, ctx] = await Promise.all([
    countUnreadNotifications(user.actor.user_id),
    getBocContext(),
  ]);

  const mainNav = MAIN_NAV.filter((item) => user.capabilities.has(item.capability));
  const adminNav = ADMIN_NAV.filter((item) => user.capabilities.has(item.capability));

  return (
    <div className="flex min-h-dvh bg-[var(--canvas)]">
      <Sidebar mainNav={mainNav} adminNav={adminNav} unreadCount={unreadCount} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          fullName={user.profile.full_name}
          jobTitle={user.profile.job_title}
          unitName={user.unit?.name ?? '—'}
          roles={user.actor.roles}
          unreadCount={unreadCount}
          businessDate={ctx.today}
          avatarColor={user.profile.avatar_color}
        />

        <main id="noi-dung-chinh" className="mx-auto w-full max-w-[100rem] flex-1 p-4 sm:p-6">
          {children}
        </main>

        <footer className="border-t border-[var(--border)] px-6 py-4 text-[11px] text-[var(--text-subtle)]">
          BOC Control Tower · Dữ liệu tính theo múi giờ Asia/Ho_Chi_Minh · Lịch làm việc và ngưỡng
          tải lấy từ Tham số hệ thống
        </footer>
      </div>
    </div>
  );
}
