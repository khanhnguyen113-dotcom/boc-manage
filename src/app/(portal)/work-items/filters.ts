import { businessDaysLeft, type BusinessCalendar } from '@/domain/business-days';
import { isOverdue } from '@/domain/dates';
import type {
  BusinessDate,
  DataQualityStatus,
  Priority,
  ScheduleType,
  WorkItem,
  WorkLevel,
  WorkStatus,
} from '@/domain/types';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import type { WorkItemQuery } from '@/server/repositories/work-items';

/**
 * Bộ lọc nằm trên URL (ADR-014).
 *
 * Nhờ vậy: mọi KPI trên dashboard chỉ cần trỏ tới `/work-items?...` là ra đúng danh sách nguồn,
 * người dùng gửi link cho nhau được, và server component đọc thẳng không cần state client.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function list(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

/** Bí danh gọn cho các link drill-down từ dashboard. */
export type WarningFilter = 'overdue' | 'near_due' | 'missing_assignee' | 'no_deadline' | undefined;

export interface ParsedFilters {
  query: WorkItemQuery;
  warning: WarningFilter;
  qualityCode: string | undefined;
  statusPreset: 'active' | 'open' | undefined;
  raw: SearchParams;
}

export function parseFilters(params: SearchParams): ParsedFilters {
  const statusRaw = list(params.status);
  const statusPreset =
    statusRaw.includes('active') ? 'active' : statusRaw.includes('open') ? 'open' : undefined;

  const explicitStatuses = statusRaw.filter(
    (s) => s !== 'active' && s !== 'open',
  ) as WorkStatus[];

  const query: WorkItemQuery = {
    search: first(params.q),
    level: list(params.level).map(Number).filter((n) => n >= 3 && n <= 6) as WorkLevel[],
    status: explicitStatuses,
    priority: list(params.priority) as Priority[],
    scheduleType: list(params.schedule) as ScheduleType[],
    dataQuality: list(params.dq) as DataQualityStatus[],
    year: first(params.year) ? Number(first(params.year)) : undefined,
    unitId: first(params.unit),
    leadUserId: first(params.lead),
    assigneeUserId: first(params.assignee),
    managementLevelId: first(params.mlevel),
    categoryId: first(params.category),
    parentId: first(params.parent),
    rootId: first(params.root),
    onlyLeaf: first(params.leaf) === '1',
    includeArchived: first(params.archived) === '1',
    page: Number(first(params.page) ?? 1) || 1,
    pageSize: Number(first(params.pageSize) ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE,
    sort: [
      {
        field: first(params.sort) ?? 'code',
        dir: first(params.dir) === 'desc' ? 'desc' : 'asc',
      },
    ],
  };

  return {
    query,
    warning: first(params.warning) as WarningFilter,
    qualityCode: first(params.quality),
    statusPreset,
    raw: params,
  };
}

/**
 * Dựng predicate cho các bộ lọc phụ thuộc ngày nghiệp vụ và lịch làm việc.
 *
 * Chạy phía server, **trước** phân trang (xem `searchWorkItems`), nếu không tổng số và các link
 * drill-down từ Control Tower sẽ trả về sai.
 */
export function buildDerivedFilter(
  parsed: ParsedFilters,
  ctx: { today: BusinessDate; calendar: BusinessCalendar; deadlineWarningDays: number },
): ((item: WorkItem) => boolean) | undefined {
  const predicates: ((item: WorkItem) => boolean)[] = [];

  if (parsed.statusPreset === 'open') {
    predicates.push((item) => item.status !== 'COMPLETED' && item.status !== 'CANCELLED');
  }
  if (parsed.statusPreset === 'active') {
    predicates.push((item) => !item.is_archived && item.status !== 'CANCELLED');
  }

  switch (parsed.warning) {
    case 'overdue':
      predicates.push((item) => isOverdue(item, ctx.today));
      break;
    case 'near_due':
      predicates.push((item) => {
        if (item.status === 'COMPLETED' || item.status === 'CANCELLED') return false;
        const left = businessDaysLeft(ctx.today, item.display_end, ctx.calendar);
        return left !== null && left >= 0 && left <= ctx.deadlineWarningDays;
      });
      break;
    case 'missing_assignee':
      predicates.push((item) => item.is_leaf && !item.primary_assignee_id);
      break;
    case 'no_deadline':
      predicates.push((item) => !item.display_end);
      break;
    default:
      break;
  }

  if (parsed.qualityCode) {
    const code = parsed.qualityCode;
    predicates.push((item) => item.data_quality_codes.includes(code));
  }

  if (predicates.length === 0) return undefined;
  return (item) => predicates.every((predicate) => predicate(item));
}

/** Chuyển search params về `URLSearchParams` để dựng link sort/phân trang. */
export function toURLSearchParams(params: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) out.append(key, v);
  }
  return out;
}

export function countActiveFilters(params: SearchParams): number {
  const ignored = new Set(['page', 'pageSize', 'sort', 'dir']);
  return Object.entries(params).filter(([key, value]) => !ignored.has(key) && Boolean(value)).length;
}
