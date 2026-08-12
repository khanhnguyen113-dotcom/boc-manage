import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Pagination, TableShell, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { requireCapability } from '@/server/auth/current-user';
import { listAuditLogs } from '@/server/repositories/collaboration';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Audit log' };

const ACTION_TONE = (action: string) => {
  if (action.startsWith('auth.')) return 'muted' as const;
  if (action.includes('cancel') || action.includes('archive')) return 'danger' as const;
  if (action.includes('complete')) return 'success' as const;
  if (action.startsWith('settings.') || action.startsWith('export.')) return 'warning' as const;
  return 'info' as const;
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; actor?: string }>;
}) {
  await requireCapability('audit.view');
  const params = await searchParams;
  const ctx = await getBocContext();

  const { rows, total, page, pageSize } = await listAuditLogs({
    action: params.action,
    actorUserId: params.actor,
    page: Number(params.page ?? 1) || 1,
    pageSize: 50,
  });

  const baseParams = new URLSearchParams(
    Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Bản ghi kỹ thuật của mọi thay đổi quan trọng: ai, làm gì, khi nào, trên bản ghi nào, trước và sau ra sao."
      />

      <Alert tone="info" title="Chỉ ghi thêm">
        Hệ thống không cung cấp bất kỳ đường nào để sửa hoặc xóa audit log từ giao diện. Mật khẩu,
        session và API key không bao giờ được ghi vào đây.
      </Alert>

      <Card className="overflow-hidden">
        <CardHeader
          title={`Bản ghi audit (${total})`}
          description="Sắp xếp mới nhất trước."
          action={
            params.action || params.actor ? (
              <Link href="/admin/audit" className="text-xs underline">
                Xóa bộ lọc
              </Link>
            ) : null
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            title="Chưa có bản ghi audit"
            description="Audit được ghi khi có đăng nhập, thay đổi công việc, đổi tham số hệ thống hoặc export dữ liệu."
          />
        ) : (
          <>
            <TableShell caption="Audit log">
              <thead>
                <tr>
                  <Th sticky>Thời điểm</Th>
                  <Th>Hành động</Th>
                  <Th>Người thực hiện</Th>
                  <Th>Đối tượng</Th>
                  <Th>Trường thay đổi</Th>
                  <Th>Lý do</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <Tr key={log.id}>
                    <Td sticky className="tabular text-xs">
                      {formatDateTime(log.created_at)}
                    </Td>
                    <Td>
                      <Link href={`/admin/audit?action=${log.action}`}>
                        <Badge tone={ACTION_TONE(log.action)}>{log.action}</Badge>
                      </Link>
                    </Td>
                    <Td className="text-xs">
                      <Link href={`/admin/audit?actor=${log.actor_user_id}`} className="hover:underline">
                        {ctx.names.userName(log.actor_user_id)}
                      </Link>
                    </Td>
                    <Td className="text-xs text-[var(--text-muted)]">
                      {log.entity_type === 'work_item' ? (
                        <Link href={`/work-items/${log.entity_id}`} className="hover:underline">
                          {log.entity_type}
                        </Link>
                      ) : (
                        log.entity_type
                      )}
                    </Td>
                    <Td className="max-w-xs text-xs text-[var(--text-muted)]">
                      <span className="block truncate" title={log.changed_fields.join(', ')}>
                        {log.changed_fields.length > 0 ? log.changed_fields.join(', ') : '—'}
                      </span>
                    </Td>
                    <Td className="max-w-xs text-xs text-[var(--text-muted)]">
                      <span className="block truncate" title={log.reason ?? undefined}>
                        {log.reason ?? '—'}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>

            <Pagination
              page={page}
              pageCount={Math.max(1, Math.ceil(total / pageSize))}
              total={total}
              pageSize={pageSize}
              baseParams={baseParams}
            />
          </>
        )}
      </Card>
    </div>
  );
}
