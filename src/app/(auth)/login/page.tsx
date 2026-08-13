import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Activity, GitBranch, ShieldCheck } from 'lucide-react';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Alert } from '@/components/ui/primitives';
import { env } from '@/config/env';
import { getSessionUser } from '@/server/auth/current-user';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Đăng nhập' };

const HIGHLIGHTS = [
  {
    icon: GitBranch,
    title: 'Một cây công việc không giới hạn độ sâu',
    body: 'Thay 5 tab rời rạc bằng một cấu trúc duy nhất, tiến độ tự cuộn từ điểm cuối lên.',
  },
  {
    icon: Activity,
    title: 'Điều hành theo dữ liệu thật',
    body: 'Mỗi KPI đều nói rõ mẫu số và bản ghi nào bị loại — không kết luận khi thiếu dữ liệu.',
  },
  {
    icon: ShieldCheck,
    title: 'Phân quyền và truy vết',
    body: 'Mỗi thay đổi quan trọng đều biết ai làm, khi nào và vì sao.',
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect('/dashboard');

  const { error } = await searchParams;
  const isLocal = env().DATA_DRIVER === 'local';

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Cột thương hiệu — ẩn trên mobile để form chiếm toàn màn hình. */}
      <section className="relative hidden overflow-hidden bg-[var(--brand-800)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 110% -10%, var(--brand-500), transparent 60%), radial-gradient(40rem 30rem at -10% 110%, var(--brand-600), transparent 55%)',
          }}
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Công ty Cổ phần Văn phòng phẩm Hồng Hà
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            Trung tâm Điều hành
            <br />
            Công việc BOC
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
            Không gian làm việc chung của toàn trung tâm: tạo việc, giao việc, cập nhật tiến độ
            hằng ngày và nhìn thấy đúng điều cần can thiệp.
          </p>
        </div>

        <ul className="relative space-y-6">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-white/10">
                <Icon aria-hidden className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 max-w-sm text-xs leading-relaxed text-white/70">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="relative text-[11px] text-white/50">
          Múi giờ nghiệp vụ Asia/Ho_Chi_Minh · Hệ thống nội bộ, không public
        </p>
      </section>

      {/* Cột đăng nhập */}
      <section className="relative flex items-center justify-center bg-[var(--canvas)] px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-subtle)]">
              Hồng Hà
            </p>
            <h1 className="mt-1 text-xl font-semibold">BOC Control Tower</h1>
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Đăng nhập</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Dùng tài khoản nội bộ được cấp. Hệ thống không mở đăng ký công khai.
            </p>
          </div>

          {error === 'inactive' ? (
            <Alert tone="warning" title="Tài khoản đã bị vô hiệu hóa">
              Liên hệ quản trị hệ thống để được kích hoạt lại.
            </Alert>
          ) : null}

          <LoginForm />

          {isLocal ? (
            <Alert tone="info" title="Môi trường phát triển">
              Đang chạy kho dữ liệu local với dữ liệu trích từ Google Sheet nguồn. Tài khoản demo:{' '}
              <code className="font-mono text-[11px]">gd.boc@boc.local</code>,{' '}
              <code className="font-mono text-[11px]">dai.nguyen@boc.local</code>,{' '}
              <code className="font-mono text-[11px]">trang.le@boc.local</code> — mật khẩu chung
              trong <code className="font-mono text-[11px]">LOCAL_DEV_PASSWORD</code>.
            </Alert>
          ) : null}
        </div>
      </section>
    </main>
  );
}
