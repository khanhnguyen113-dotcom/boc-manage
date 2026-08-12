import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

import { DataQualityBadge, LevelBadge } from '@/components/ui/badges';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { TableShell, Td, Th, Tr } from '@/components/ui/table';
import { DATA_QUALITY_LABELS, tallyDataQuality, type DataQualityCode } from '@/domain/data-quality';
import { formatInteger, formatPercent } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import { listWorkItemsInScope } from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';

export const metadata: Metadata = { title: 'Chất lượng dữ liệu' };

/**
 * Data Health — guideline 11.1.
 *
 * Mục đích không phải “chấm điểm” mà là **giao việc sửa dữ liệu**: mỗi mã lỗi dẫn thẳng tới danh
 * sách bản ghi và người chịu trách nhiệm.
 */
export default async function DataHealthPage() {
  const user = await requireUser();
  const ctx = await getBocContext();

  const items = await listWorkItemsInScope(user.scope);
  const active = items.filter((i) => !i.is_archived && i.status !== 'CANCELLED');
  const tally = tallyDataQuality(active);

  const problems = active
    .filter((i) => i.data_quality_status !== 'VALID')
    .sort((a, b) => {
      if (a.data_quality_status !== b.data_quality_status) {
        return a.data_quality_status === 'INVALID' ? -1 : 1;
      }
      return b.data_quality_codes.length - a.data_quality_codes.length;
    });

  const byOwner = new Map<string, number>();
  for (const item of problems) {
    const key = item.primary_assignee_id ?? item.lead_user_id ?? 'UNASSIGNED';
    byOwner.set(key, (byOwner.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chất lượng dữ liệu"
        description="Bản ghi thiếu hoặc sai dữ liệu không được đưa vào kết luận tải và báo cáo. Sửa xong, số liệu tự cập nhật."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <Stat
              label="Độ đầy đủ dữ liệu"
              value={formatPercent(tally.completeness)}
              hint={`${formatInteger(tally.valid)}/${formatInteger(active.length)} bản ghi hợp lệ`}
              tone={tally.completeness !== null && tally.completeness < 95 ? 'warning' : 'success'}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Đủ dữ liệu" value={formatInteger(tally.valid)} tone="success" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Thiếu dữ liệu" value={formatInteger(tally.incomplete)} tone="warning" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Dữ liệu sai"
              value={formatInteger(tally.invalid)}
              tone={tally.invalid > 0 ? 'danger' : undefined}
              hint="Mâu thuẫn logic, phải sửa trước khi tin báo cáo"
            />
          </CardBody>
        </Card>
      </div>

      {tally.invalid > 0 ? (
        <Alert tone="danger" title={`${tally.invalid} bản ghi có dữ liệu sai`}>
          Ví dụ: ngày kết thúc trước ngày bắt đầu, hoàn thành nhưng tiến độ chưa đủ 100%, hoặc nhập
          tiến độ thủ công ở công việc đã có con. Những bản ghi này bị loại khỏi kết luận quản trị.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            icon={ShieldCheck}
            title="Theo loại lỗi"
            description="Bấm để mở đúng danh sách bản ghi cần sửa."
          />
          {tally.by_code.length === 0 ? (
            <EmptyState title="Không có lỗi dữ liệu" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {tally.by_code.map((row) => (
                <li key={row.code}>
                  <Link
                    href={`/work-items?quality=${row.code}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-[var(--surface-hover)]"
                  >
                    <span className="min-w-0 truncate">
                      {DATA_QUALITY_LABELS[row.code as DataQualityCode] ?? row.code}
                    </span>
                    <Badge tone={row.severity === 'INVALID' ? 'danger' : 'warning'}>
                      {formatInteger(row.count)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader
            title={`Bản ghi cần xử lý (${problems.length})`}
            description="Sắp xếp theo mức nghiêm trọng rồi số lỗi."
          />
          {problems.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Toàn bộ dữ liệu trong phạm vi đều hợp lệ"
              description="Không có bản ghi nào thiếu hoặc sai dữ liệu bắt buộc."
            />
          ) : (
            <TableShell caption="Bản ghi cần bổ sung hoặc sửa dữ liệu" className="max-h-[32rem] overflow-y-auto">
              <thead>
                <tr>
                  <Th sticky>Mã</Th>
                  <Th>Tên công việc</Th>
                  <Th>Người chịu trách nhiệm</Th>
                  <Th>Vấn đề</Th>
                </tr>
              </thead>
              <tbody>
                {problems.slice(0, 100).map((item) => (
                  <Tr key={item.id}>
                    <Td sticky>
                      <Link
                        href={`/work-items/${item.id}`}
                        className="flex items-center gap-2 font-mono text-xs hover:underline"
                      >
                        <LevelBadge level={item.level} />
                        {item.code}
                      </Link>
                    </Td>
                    <Td className="max-w-xs">
                      <span className="block truncate">{item.title}</span>
                    </Td>
                    <Td className="text-xs text-[var(--text-muted)]">
                      {ctx.names.userName(item.primary_assignee_id ?? item.lead_user_id)}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <DataQualityBadge status={item.data_quality_status} />
                        {item.data_quality_codes.slice(0, 3).map((code) => (
                          <span
                            key={code}
                            className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                          >
                            {DATA_QUALITY_LABELS[code as DataQualityCode] ?? code}
                          </span>
                        ))}
                        {item.data_quality_codes.length > 3 ? (
                          <span className="text-[10px] text-[var(--text-subtle)]">
                            +{item.data_quality_codes.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Bản ghi cần xử lý theo người" />
        <CardBody>
          <ul className="flex flex-wrap gap-2">
            {[...byOwner.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([owner, count]) => (
                <li key={owner}>
                  <Link
                    href={owner === 'UNASSIGNED' ? '/work-items?warning=missing_assignee' : `/work-items?assignee=${owner}&dq=INCOMPLETE`}
                    className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)]"
                  >
                    {owner === 'UNASSIGNED' ? 'Chưa giao' : ctx.names.userName(owner)}
                    <Badge tone="warning">{formatInteger(count)}</Badge>
                  </Link>
                </li>
              ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
