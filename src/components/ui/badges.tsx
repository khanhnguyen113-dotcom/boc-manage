import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  CircleDashed,
  CirclePause,
  CircleSlash,
  Loader,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import {
  DATA_QUALITY_STATUS_BY_CODE,
  EXECUTION_STATUS_BY_CODE,
  PRIORITY_BY_CODE,
  SCHEDULE_TYPE_BY_CODE,
  WORK_STATUS_BY_CODE,
} from '@/domain/catalogs';
import type {
  DataQualityStatus,
  ExecutionStatus,
  Priority,
  ScheduleType,
  WorkLevel,
  WorkStatus,
} from '@/domain/types';
import { LOAD_STATE_LABELS, type LoadState } from '@/domain/workload';
import { cn } from '@/lib/cn';
import { TONE_CLASS } from '@/lib/format';

import { Badge } from './primitives';

/* Badge nghiệp vụ — mỗi cái luôn có CHỮ, không chỉ màu (guideline 13.4). */

const STATUS_ICONS: Record<WorkStatus, LucideIcon> = {
  NOT_SCHEDULED: CircleDashed,
  SCHEDULED: CalendarClock,
  NOT_STARTED: CircleDashed,
  IN_PROGRESS: Loader,
  PAUSED: CirclePause,
  COMPLETED: CheckCircle2,
  CANCELLED: CircleSlash,
};

export function StatusBadge({ status }: { status: WorkStatus }) {
  const entry = WORK_STATUS_BY_CODE[status];
  return (
    <Badge tone={entry.tone} icon={STATUS_ICONS[status]}>
      {entry.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) {
    return (
      <Badge tone="muted" title="Chưa gán mức độ ưu tiên">
        Chưa có
      </Badge>
    );
  }
  const entry = PRIORITY_BY_CODE[priority];
  return <Badge tone={entry.tone}>{priority}</Badge>;
}

export function ScheduleTypeBadge({ type }: { type: ScheduleType }) {
  const entry = SCHEDULE_TYPE_BY_CODE[type];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const entry = EXECUTION_STATUS_BY_CODE[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const QUALITY_ICONS: Record<DataQualityStatus, LucideIcon> = {
  VALID: ShieldCheck,
  INCOMPLETE: AlertTriangle,
  INVALID: AlertOctagon,
};

export function DataQualityBadge({
  status,
  codeCount,
}: {
  status: DataQualityStatus;
  codeCount?: number;
}) {
  const entry = DATA_QUALITY_STATUS_BY_CODE[status];
  return (
    <Badge tone={entry.tone} icon={QUALITY_ICONS[status]}>
      {entry.label}
      {codeCount && codeCount > 0 ? ` · ${codeCount}` : ''}
    </Badge>
  );
}

function levelTone(level: WorkLevel): string {
  if (level === 3) return TONE_CLASS.strategic;
  if (level === 4) return TONE_CLASS.info;
  if (level === 5) return TONE_CLASS.progress;
  return TONE_CLASS.neutral;
}

export function LevelBadge({ level }: { level: WorkLevel }) {
  return (
    <span
      title={`Lớp ${level}`}
      className={cn(
        'inline-flex h-5 min-w-8 items-center justify-center rounded border px-1 text-[11px] font-semibold tabular',
        levelTone(level),
      )}
    >
      L{level}
    </span>
  );
}

const LOAD_TONE: Record<LoadState, Parameters<typeof Badge>[0]['tone']> = {
  INSUFFICIENT_DATA: 'muted',
  NORMAL: 'success',
  NEAR_CAPACITY: 'warning',
  OVER_CAPACITY: 'danger',
};

export function LoadStateBadge({ state }: { state: LoadState }) {
  return (
    <Badge
      tone={LOAD_TONE[state]}
      title={
        state === 'INSUFFICIENT_DATA'
          ? 'Thiếu tổng giờ, đơn vị phân bổ hoặc giờ/kỳ — không kết luận mức tải'
          : undefined
      }
    >
      {LOAD_STATE_LABELS[state]}
    </Badge>
  );
}

/** `daysLeft` theo cách đếm của `deadlineDaysAway`: hôm nay = 0, ngày làm việc kế tiếp = 1. */
export function OverdueBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return null;
  if (daysLeft < 0) {
    return (
      <Badge tone="danger" icon={CalendarX}>
        Quá hạn {Math.abs(daysLeft)} ngày
      </Badge>
    );
  }
  if (daysLeft === 0) {
    return (
      <Badge tone="danger" icon={CalendarClock}>
        Đến hạn hôm nay
      </Badge>
    );
  }
  if (daysLeft <= 7) {
    return (
      <Badge tone="warning" icon={CalendarClock}>
        Còn {daysLeft} ngày
      </Badge>
    );
  }
  return null;
}
