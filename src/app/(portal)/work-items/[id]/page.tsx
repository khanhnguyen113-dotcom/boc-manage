import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Activity,
  ClipboardList,
  FileText,
  GitBranch,
  History,
  Info,
  MessageSquare,
  Pencil,
} from 'lucide-react';

import {
  DataQualityBadge,
  LevelBadge,
  OverdueBadge,
  PriorityBadge,
  ScheduleTypeBadge,
  StatusBadge,
} from '@/components/ui/badges';
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { businessDaysLeft, formatDate } from '@/domain/business-days';
import { RECURRENCE_CYCLE_BY_CODE } from '@/domain/catalogs';
import { DATA_QUALITY_LABELS, type DataQualityCode } from '@/domain/data-quality';
import { buildTreeIndex } from '@/domain/hierarchy';
import { canReadWorkItem, relationTo } from '@/domain/permissions';
import { remainingHours } from '@/domain/progress';
import { statusWarnings } from '@/domain/status';
import { computeItemLoad, LOAD_STATE_LABELS, classifyLoad } from '@/domain/workload';
import { formatDateTime, formatHours, formatRelative, EMPTY } from '@/lib/format';
import { requireUser } from '@/server/auth/current-user';
import {
  listActivity,
  listAttachments,
  listComments,
  listExecutionLogs,
} from '@/server/repositories/collaboration';
import { listAuditLogs } from '@/server/repositories/collaboration';
import {
  getWorkItem,
  listAssignments,
  listTreeFor,
} from '@/server/repositories/work-items';
import { getBocContext } from '@/server/services/context';
import { baselineWarningsFor } from '@/server/services/work-items';

import { CommentForm } from './comment-form';
import { ExecutionLogForm } from './execution-log-form';
import { StatusPanel } from './status-panel';
import { CompletionPanel } from './completion-panel';

type Tab = 'overview' | 'children' | 'logs' | 'comments' | 'files' | 'activity' | 'audit';

const TABS: { key: Tab; label: string; icon: typeof Info }[] = [
  { key: 'overview', label: 'Tổng quan', icon: Info },
  { key: 'children', label: 'Cây con', icon: GitBranch },
  { key: 'logs', label: 'Nhật ký', icon: ClipboardList },
  { key: 'comments', label: 'Bình luận', icon: MessageSquare },
  { key: 'files', label: 'Tệp & kết quả', icon: FileText },
  { key: 'activity', label: 'Hoạt động', icon: Activity },
  { key: 'audit', label: 'Audit', icon: History },
];

export const metadata: Metadata = { title: 'Chi tiết công việc' };

export default async function WorkItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const item = await getWorkItem(id);
  if (!item) notFound();

  // Chống IDOR: kiểm quyền đọc trên chính bản ghi, không dựa vào việc UI có link hay không.
  const assignments = await listAssignments(item.id);
  const collaborators = assignments
    .filter((a) => a.assignment_role === 'COLLABORATOR')
    .map((a) => a.user_id);
  const relation = relationTo(item, user.actor.user_id, collaborators);
  if (!canReadWorkItem(user.actor, user.scope, item, relation)) notFound();

  const ctx = await getBocContext();
  const tab = (TABS.find((t) => t.key === tabParam)?.key ?? 'overview') as Tab;

  const treeItems = await listTreeFor([item.root_id]);
  const tree = buildTreeIndex(treeItems);
  const children = (tree.childrenOf.get(item.id) ?? []).filter((c) => !c.is_archived);
  const ancestors = [];
  let cursor = item.parent_id ? tree.byId.get(item.parent_id) : undefined;
  while (cursor) {
    ancestors.unshift(cursor);
    cursor = cursor.parent_id ? tree.byId.get(cursor.parent_id) : undefined;
  }

  const [logs, comments, attachments, activity, warnings] = await Promise.all([
    listExecutionLogs(item.id),
    listComments('work_item', item.id),
    listAttachments('work_item', item.id),
    listActivity('work_item', item.id),
    baselineWarningsFor(item),
  ]);

  const audit = user.capabilities.has('audit.view')
    ? await listAuditLogs({ entityType: 'work_item', entityId: item.id, pageSize: 50 })
    : null;

  const daysLeft = businessDaysLeft(ctx.today, item.display_end, ctx.calendar);
  const load = computeItemLoad(item, ctx.today, ctx.calendar, ctx.capacity);
  const inconsistencies = statusWarnings(item, ctx.today);
  const canEdit = user.capabilities.has('work.edit_core');
  const canSubmitCompletion =
    user.capabilities.has('work.submit_completion') && item.primary_assignee_id === user.actor.user_id;
  const canReviewCompletion =
    user.capabilities.has('work.approve_completion') &&
    item.completion_submitted_by !== user.actor.user_id &&
    (item.lead_user_id === user.actor.user_id ||
      (user.actor.roles.some((role) =>
        ['unit_manager', 'business_admin', 'boc_director', 'system_admin'].includes(role),
      ) &&
        (user.scope.all || user.scope.unit_ids.has(item.owning_unit_id))));

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <Link href="/work-items" className="hover:underline">
              Công việc
            </Link>
            {ancestors.map((a) => (
              <span key={a.id} className="flex items-center gap-1">
                <span aria-hidden>/</span>
                <Link href={`/work-items/${a.id}`} className="hover:underline">
                  {a.code}
                </Link>
              </span>
            ))}
            <span aria-hidden>/</span>
            <span className="font-mono text-[var(--text)]">{item.code}</span>
          </nav>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <LevelBadge level={item.level} />
            {item.title}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
            <ScheduleTypeBadge type={item.schedule_type} />
            <OverdueBadge daysLeft={daysLeft} />
            <DataQualityBadge
              status={item.data_quality_status}
              codeCount={item.data_quality_codes.length}
            />
          </span>
        }
        actions={
          canEdit ? (
            <ButtonLink href={`/work-items/${item.id}/edit`} variant="secondary" size="sm">
              <Pencil aria-hidden className="size-4" />
              Chỉnh sửa
            </ButtonLink>
          ) : null
        }
      />

      {item.data_quality_codes.length > 0 ? (
        <Alert
          tone={item.data_quality_status === 'INVALID' ? 'danger' : 'warning'}
          title={
            item.data_quality_status === 'INVALID'
              ? 'Bản ghi có dữ liệu sai — chưa đưa vào kết luận quản trị'
              : 'Bản ghi còn thiếu dữ liệu bắt buộc'
          }
        >
          <ul className="list-inside list-disc">
            {item.data_quality_codes.map((code) => (
              <li key={code}>{DATA_QUALITY_LABELS[code as DataQualityCode] ?? code}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {inconsistencies.length > 0 ? (
        <Alert tone="warning" title="Trạng thái chưa nhất quán">
          <ul className="list-inside list-disc">
            {inconsistencies.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert tone="warning" title="Công việc con vượt khung kế hoạch gốc">
          <ul className="list-inside list-disc">
            {warnings.map((w) => (
              <li key={`${w.code}-${w.related_code}`}>{w.message}</li>
            ))}
          </ul>
          Hệ thống chỉ cảnh báo và <strong>không tự sửa</strong> ngày kế hoạch gốc — người phụ trách
          quyết định điều chỉnh baseline hay lịch của việc con.
        </Alert>
      ) : null}

      {/* --- Chỉ số nhanh ------------------------------------------------- */}
      <Card>
        <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2 sm:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
              Tiến độ {item.is_leaf ? '(nhập tại điểm cuối)' : '(cuộn từ việc con)'}
            </p>
            <ProgressBar value={item.effective_progress} />
            <p className="text-[11px] text-[var(--text-muted)]">
              {item.is_leaf
                ? 'Đây là điểm cuối — tiến độ nhập trực tiếp.'
                : `Trung bình từ ${children.length} công việc con hợp lệ.`}
            </p>
          </div>

          <Stat
            label="Hạn hoàn thành"
            value={formatDate(item.display_end)}
            hint={
              item.planned_end && item.planned_end !== item.display_end
                ? `Kế hoạch gốc ${formatDate(item.planned_end)}`
                : 'Trùng kế hoạch gốc'
            }
            tone={daysLeft !== null && daysLeft < 0 ? 'danger' : undefined}
          />
          <Stat
            label="Khối lượng"
            value={formatHours(item.effective_estimated_hours)}
            hint={`Còn lại ${formatHours(remainingHours(item))}`}
          />
          <Stat
            label="Tải quy đổi"
            value={load.daily_load === null ? EMPTY : `${load.daily_load} h/ngày`}
            hint={
              load.gaps.length > 0
                ? LOAD_STATE_LABELS.INSUFFICIENT_DATA
                : LOAD_STATE_LABELS[
                    classifyLoad((load.daily_load ?? 0) / ctx.capacity.defaultHoursPerDay, ctx.capacity)
                  ]
            }
          />
        </CardBody>
      </Card>

      {/* --- Tabs ---------------------------------------------------------- */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {TABS.map(({ key, label, icon: Icon }) => {
          if (key === 'audit' && !audit) return null;
          const active = key === tab;
          const count =
            key === 'children'
              ? children.length
              : key === 'logs'
                ? logs.length
                : key === 'comments'
                  ? comments.length
                  : key === 'files'
                    ? attachments.length
                    : undefined;

          return (
            <Link
              key={key}
              href={`/work-items/${item.id}?tab=${key}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex items-center gap-1.5 border-b-2 border-[var(--brand-600)] px-3 py-2 text-sm font-medium text-[var(--brand-700)]'
                  : 'flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]'
              }
            >
              <Icon aria-hidden className="size-4" />
              {label}
              {count !== undefined && count > 0 ? (
                <span className="tabular rounded-full bg-[var(--surface-sunken)] px-1.5 text-[10px]">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Nội dung công việc" />
            <CardBody className="space-y-4 text-sm">
              <Detail label="Kết quả đầu ra" value={item.expected_output} />
              <Detail label="Giá trị mang lại" value={item.value_contribution} />
              <Detail label="Mô tả" value={item.description} />
              <Detail label="Link kết quả" value={item.result_link} isLink />
              {item.cancel_reason ? (
                <Detail label="Lý do hủy" value={item.cancel_reason} />
              ) : null}
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Trách nhiệm" />
              <CardBody className="space-y-3 text-sm">
                <Detail label="Đơn vị phụ trách" value={ctx.names.unitName(item.owning_unit_id)} />
                <Detail label="Người Lead" value={ctx.names.userName(item.lead_user_id)} />
                <Detail
                  label="Người thực hiện"
                  value={ctx.names.userName(item.primary_assignee_id)}
                />
                {collaborators.length > 0 ? (
                  <Detail
                    label="Phối hợp"
                    value={collaborators.map((c) => ctx.names.userName(c)).join(', ')}
                  />
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Kế hoạch" />
              <CardBody className="space-y-3 text-sm">
                <Detail label="Bắt đầu (gốc)" value={formatDate(item.planned_start)} />
                <Detail label="Kết thúc (gốc)" value={formatDate(item.planned_end)} />
                <Detail label="Hiển thị" value={`${formatDate(item.display_start)} → ${formatDate(item.display_end)}`} />
                <Detail label="Ngày rà soát" value={formatDate(item.review_date)} />
                {item.recurrence_rule ? (
                  <Detail
                    label="Chu kỳ"
                    value={RECURRENCE_CYCLE_BY_CODE[item.recurrence_rule].label}
                  />
                ) : null}
                <Detail
                  label="Phân bổ"
                  value={
                    item.allocation_hours && item.allocation_unit
                      ? `${item.allocation_hours} giờ / ${item.allocation_unit === 'DAY' ? 'ngày' : 'tuần'}`
                      : null
                  }
                />
                <Detail label="Hoàn thành thực tế" value={formatDate(item.completed_at)} />
              </CardBody>
            </Card>

            <CompletionPanel
              item={item}
              today={ctx.today}
              canSubmit={canSubmitCompletion}
              canReview={canReviewCompletion}
              submitterName={ctx.names.userName(item.completion_submitted_by)}
              reviewerName={ctx.names.userName(item.completion_reviewed_by)}
            />
            <StatusPanel item={item} />
          </div>
        </div>
      ) : null}

      {tab === 'children' ? (
        <Card>
          <CardHeader
            title={`Công việc con (${children.length})`}
            description="Tiến độ, ngày hiển thị và khối lượng của công việc này được cuộn lên từ danh sách dưới đây."
          />
          {children.length === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="Đây là điểm cuối"
              description="Không có công việc con nào đang hoạt động, nên tiến độ được nhập trực tiếp tại đây."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {children.map((child) => (
                <li key={child.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <LevelBadge level={child.level} />
                  <Link
                    href={`/work-items/${child.id}`}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                  >
                    <span className="font-mono text-[11px] text-[var(--text-subtle)]">
                      {child.code}
                    </span>{' '}
                    {child.title}
                  </Link>
                  <span className="w-32">
                    <ProgressBar value={child.effective_progress} size="sm" />
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatDate(child.display_end)}
                  </span>
                  <StatusBadge status={child.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'logs' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={`Nhật ký thực hiện (${logs.length})`}
              description="Số liệu định kỳ trong báo cáo lấy từ đây, không suy ra từ trạng thái công việc."
            />
            {logs.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Chưa có nhật ký nào"
                description="Ghi lại từng lần thực hiện để báo cáo tuần/tháng có số giờ thực tế."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {logs.map((log) => (
                  <li key={log.id} className="space-y-1 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <code className="font-mono text-[11px] text-[var(--text-subtle)]">
                        {log.record_code}
                      </code>
                      <span>
                        Kỳ {formatDate(log.period_start)}
                        {log.period_end ? ` → ${formatDate(log.period_end)}` : ''}
                      </span>
                      <Badge tone={log.deadline_result === 'LATE' ? 'danger' : 'success'}>
                        {log.deadline_result === 'ON_TIME'
                          ? 'Đúng hạn'
                          : log.deadline_result === 'LATE'
                            ? 'Trễ hạn'
                            : 'Chưa đánh giá'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {ctx.names.userName(log.responsible_user_id)} · {formatHours(log.actual_hours)}{' '}
                      thực tế
                      {log.note ? ` · ${log.note}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ExecutionLogForm
            workItemId={item.id}
            defaultResponsible={item.primary_assignee_id ?? user.actor.user_id}
            today={ctx.today}
            defaultDue={item.display_end}
          />
        </div>
      ) : null}

      {tab === 'comments' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={`Trao đổi (${comments.length})`} />
            {comments.length === 0 ? (
              <EmptyState icon={MessageSquare} title="Chưa có trao đổi nào" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {comments.map((comment) => (
                  <li key={comment.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">
                        {ctx.names.userName(comment.author_user_id)}
                      </p>
                      <time className="text-[11px] text-[var(--text-subtle)]" dateTime={comment.created_at}>
                        {formatRelative(comment.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-muted)]">
                      {comment.is_hidden ? '[Bình luận đã bị ẩn bởi kiểm duyệt]' : comment.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <CommentForm entityId={item.id} />
        </div>
      ) : null}

      {tab === 'files' ? (
        <Card>
          <CardHeader
            title="Tệp & kết quả"
            description="Bằng chứng hoàn thành: link kết quả hoặc tệp đính kèm."
          />
          <CardBody className="space-y-3">
            {item.result_link ? (
              <p className="text-sm">
                Link kết quả:{' '}
                <a
                  href={item.result_link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[var(--brand-700)] underline"
                >
                  {item.result_link}
                </a>
              </p>
            ) : null}

            {attachments.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Chưa có tệp đính kèm"
                description="Tải tệp lên cần bucket Appwrite Storage đã cấu hình. Trong lúc chờ, dùng Link kết quả."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {attachments.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate">{file.original_name}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {Math.round(file.size_bytes / 1024)} KB · {formatDateTime(file.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === 'activity' ? (
        <Card>
          <CardHeader title="Dòng hoạt động" description="Bản hiển thị thân thiện của lịch sử thay đổi." />
          {activity.length === 0 ? (
            <EmptyState icon={Activity} title="Chưa có hoạt động nào" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {activity.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>{event.summary}</span>
                  <time className="shrink-0 text-[11px] text-[var(--text-subtle)]" dateTime={event.created_at}>
                    {formatRelative(event.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'audit' && audit ? (
        <Card>
          <CardHeader
            title="Audit log"
            description="Bản kỹ thuật, chỉ ghi thêm — không sửa, không xóa được từ giao diện."
          />
          {audit.rows.length === 0 ? (
            <EmptyState icon={History} title="Chưa có bản ghi audit" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {audit.rows.map((log) => (
                <li key={log.id} className="space-y-1 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <code className="font-mono text-xs">{log.action}</code>
                    <time className="text-[11px] text-[var(--text-subtle)]" dateTime={log.created_at}>
                      {formatDateTime(log.created_at)}
                    </time>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {ctx.names.userName(log.actor_user_id)}
                    {log.changed_fields.length > 0
                      ? ` · thay đổi: ${log.changed_fields.join(', ')}`
                      : ''}
                    {log.reason ? ` · lý do: ${log.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  isLink,
}: {
  label: string;
  value: string | null | undefined;
  isLink?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]">
        {!value ? (
          <span className="text-[var(--text-subtle)]">{EMPTY}</span>
        ) : isLink ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all text-[var(--brand-700)] underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
