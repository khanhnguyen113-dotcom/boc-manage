import 'server-only';

import { monthRange, weekRange, yearRange, type DateRange } from '@/domain/business-days';
import { computeControlTower, type ControlTowerSnapshot } from '@/domain/metrics';
import { computePeriodReport, type PeriodReport } from '@/domain/metrics';
import { computePersonLoad, resolveCapacity, type PersonLoad } from '@/domain/workload';
import type { WorkItem } from '@/domain/types';

import type { SessionUser } from '../auth/current-user';
import { listActiveProfiles, listUnits } from '../repositories/catalogs';
import { listExecutionLogsFor } from '../repositories/collaboration';
import { listWorkItemsInScope } from '../repositories/work-items';
import { getBocContext } from './context';

/**
 * Service tính toán dùng chung — guideline mục 10.
 *
 * Dashboard, My Work, báo cáo và export đều gọi những hàm ở đây, nên KPI trên màn hình và trong
 * file XLSX **không thể lệch nhau**. Scope hiệu lực được áp **trước** khi tổng hợp.
 */

export type PeriodKind = 'week' | 'month' | 'year' | 'custom';

export function resolvePeriod(kind: PeriodKind, today: string, custom?: DateRange): DateRange {
  switch (kind) {
    case 'week':
      return weekRange(today);
    case 'month':
      return monthRange(today);
    case 'year':
      return yearRange(Number(today.slice(0, 4)));
    case 'custom':
      return custom ?? monthRange(today);
  }
}

export interface DashboardFilters {
  period: PeriodKind;
  year?: number;
  unitId?: string;
  categoryId?: string;
  managementLevelId?: string;
  assigneeId?: string;
}

export async function getControlTowerSnapshot(
  user: SessionUser,
  filters: DashboardFilters,
): Promise<{ snapshot: ControlTowerSnapshot; period: DateRange; items: WorkItem[] }> {
  const ctx = await getBocContext();
  const period = resolvePeriod(filters.period, ctx.today);

  let items = await listWorkItemsInScope(user.scope, { year: filters.year });

  if (filters.unitId) items = items.filter((i) => i.owning_unit_id === filters.unitId);
  if (filters.categoryId) items = items.filter((i) => i.category_id === filters.categoryId);
  if (filters.managementLevelId) {
    items = items.filter((i) => i.management_level_id === filters.managementLevelId);
  }
  if (filters.assigneeId) items = items.filter((i) => i.primary_assignee_id === filters.assigneeId);

  const snapshot = computeControlTower(items, period, ctx.metrics, {
    unitName: ctx.names.unitName,
    userName: ctx.names.userName,
    categoryName: (code) => code,
    managementLevelName: (code) => (code === 'COMPANY' ? 'Cấp công ty' : 'Cấp phòng ban'),
  });

  return { snapshot, period, items };
}

export async function getPeriodReport(
  user: SessionUser,
  kind: PeriodKind,
  custom?: DateRange,
): Promise<{ report: PeriodReport; period: DateRange }> {
  const ctx = await getBocContext();
  const period = resolvePeriod(kind, ctx.today, custom);

  const items = await listWorkItemsInScope(user.scope);
  const logs = await listExecutionLogsFor(items.map((i) => i.id));

  return { report: computePeriodReport(items, logs, period, ctx.metrics), period };
}

export interface WorkloadRow extends PersonLoad {
  full_name: string;
  unit_name: string;
  job_title: string | null;
  avatar_color: string | null;
}

export async function getWorkloadSnapshot(
  user: SessionUser,
  range?: DateRange,
): Promise<{ rows: WorkloadRow[]; range: DateRange; unassignedCount: number }> {
  const ctx = await getBocContext();
  const period = range ?? weekRange(ctx.today);

  const [items, profiles, units] = await Promise.all([
    listWorkItemsInScope(user.scope),
    listActiveProfiles(),
    listUnits(),
  ]);

  const unitById = new Map(units.map((u) => [u.id, u]));
  const byAssignee = new Map<string, WorkItem[]>();
  let unassignedCount = 0;

  for (const item of items) {
    if (!item.is_leaf || item.is_archived) continue;
    if (item.status === 'COMPLETED' || item.status === 'CANCELLED') continue;
    if (!item.primary_assignee_id) {
      unassignedCount += 1;
      continue;
    }
    const bucket = byAssignee.get(item.primary_assignee_id);
    if (bucket) bucket.push(item);
    else byAssignee.set(item.primary_assignee_id, [item]);
  }

  const rows: WorkloadRow[] = profiles
    .filter((profile) => user.scope.all || byAssignee.has(profile.user_id))
    .map((profile) => {
      const unit = profile.primary_unit_id ? unitById.get(profile.primary_unit_id) : null;
      const load = computePersonLoad(
        {
          user_id: profile.user_id,
          capacityHoursPerDay: resolveCapacity(
            profile.capacity_hours_per_day,
            unit?.capacity_hours_per_day,
            ctx.capacity,
          ),
          items: byAssignee.get(profile.user_id) ?? [],
        },
        period,
        ctx.today,
        ctx.calendar,
        ctx.capacity,
      );

      return {
        ...load,
        full_name: profile.full_name,
        unit_name: unit?.name ?? '—',
        job_title: profile.job_title,
        avatar_color: profile.avatar_color,
      };
    })
    .sort((a, b) => b.utilization - a.utilization || b.item_count - a.item_count);

  return { rows, range: period, unassignedCount };
}
