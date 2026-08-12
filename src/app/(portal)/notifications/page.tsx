import type { Metadata } from 'next';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { BellOff, CheckCheck } from 'lucide-react';

import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import type { NotificationType } from '@/domain/types';
import { formatRelative } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listNotifications } from '@/server/repositories/collaboration';
import { markAllNotificationsRead } from '@/server/services/notifications';

export const metadata: Metadata = { title: 'Thông báo' };

const TYPE_LABELS: Record<NotificationType, { label: string; tone: 'danger' | 'warning' | 'info' | 'success' | 'muted' }> = {
  WORK_ASSIGNED: { label: 'Giao việc', tone: 'info' },
  WORK_UNASSIGNED: { label: 'Bỏ giao việc', tone: 'muted' },
  COLLABORATOR_ADDED: { label: 'Thêm phối hợp', tone: 'info' },
  MENTIONED: { label: 'Nhắc tới bạn', tone: 'info' },
  DEADLINE_NEAR: { label: 'Sắp đến hạn', tone: 'warning' },
  OVERDUE: { label: 'Quá hạn', tone: 'danger' },
  P1_CHANGED: { label: 'Thay đổi P1', tone: 'danger' },
  CHILD_OUTSIDE_PARENT: { label: 'Con vượt khung cha', tone: 'warning' },
  MISSING_DATA: { label: 'Thiếu dữ liệu', tone: 'warning' },
  STATUS_CHANGED: { label: 'Đổi trạng thái', tone: 'success' },
  IMPORT_DONE: { label: 'Import xong', tone: 'muted' },
  EXPORT_DONE: { label: 'Export xong', tone: 'muted' },
};

async function markAllRead() {
  'use server';
  const user = await requireUser();
  await markAllNotificationsRead(user.actor.user_id);
  revalidatePath('/notifications');
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.actor.user_id, { limit: 100 });
  const unread = notifications.filter((n) => !n.read_at);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thông báo"
        description="Giao việc, thay đổi trạng thái, mention và cảnh báo deadline. Thông báo trong ứng dụng là kênh bắt buộc của MVP; email/digest thuộc giai đoạn sau."
        actions={
          unread.length > 0 ? (
            <form action={markAllRead}>
              <Button type="submit" variant="secondary" size="sm">
                <CheckCheck aria-hidden className="size-4" />
                Đánh dấu đã đọc ({unread.length})
              </Button>
            </form>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title={`Hộp thông báo (${notifications.length})`}
          description="Đã lọc trùng theo sự kiện + bản ghi + người nhận trong cùng ngày."
        />

        {notifications.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Chưa có thông báo nào"
            description="Bạn sẽ nhận thông báo khi được giao việc, được nhắc tới trong bình luận, hoặc khi công việc bạn phụ trách sắp đến hạn."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {notifications.map((notification) => {
              const meta = TYPE_LABELS[notification.type] ?? { label: notification.type, tone: 'muted' as const };
              const href =
                notification.entity_type === 'work_item'
                  ? `/work-items/${notification.entity_id}`
                  : '/my-work';

              return (
                <li
                  key={notification.id}
                  className={notification.read_at ? '' : 'bg-[var(--brand-50)] dark:bg-[var(--brand-950)]'}
                >
                  <Link
                    href={href}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3 hover:bg-[var(--surface-hover)]"
                  >
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{notification.title}</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        {notification.body}
                      </span>
                    </span>
                    <time
                      dateTime={notification.created_at}
                      className="shrink-0 text-[11px] text-[var(--text-subtle)]"
                    >
                      {formatRelative(notification.created_at)}
                    </time>
                    {!notification.read_at ? (
                      <span
                        aria-label="Chưa đọc"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--brand-600)]"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
