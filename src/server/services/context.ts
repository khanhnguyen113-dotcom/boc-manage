import 'server-only';

import { cache } from 'react';

import { env } from '@/config/env';
import {
  createCalendar,
  WORK_WEEK_MASKS,
  type BusinessCalendar,
} from '@/domain/business-days';
import type { MetricsContext } from '@/domain/metrics';
import type { ProgressContext, ProgressRollupMode } from '@/domain/progress';
import type { CategoryCode, ManagementLevelCode, WorkItem } from '@/domain/types';
import { DEFAULT_CAPACITY, type CapacityConfig } from '@/domain/workload';

import { businessClock } from '../clock';
import {
  categoryMap,
  getSystemSetting,
  listHolidays,
  managementLevelMap,
  resolveNames,
} from '../repositories/catalogs';

/**
 * Gói mọi tham số nghiệp vụ mà domain cần vào một chỗ.
 *
 * Thứ tự ưu tiên cấu hình: `system_settings` (admin sửa được trên UI) → biến môi trường →
 * mặc định trong code. Nhờ vậy đổi ngưỡng cận tải hay lịch làm việc **không cần deploy lại**
 * (guideline 1.4: cấu hình thay vì hard-code).
 */

export interface BocContext {
  today: string;
  calendar: BusinessCalendar;
  capacity: CapacityConfig;
  progress: ProgressContext;
  metrics: MetricsContext;
  categoryCodeOf: (item: WorkItem) => CategoryCode | null;
  managementLevelCodeOf: (item: WorkItem) => ManagementLevelCode | null;
  names: Awaited<ReturnType<typeof resolveNames>>;
  rollupMode: ProgressRollupMode;
  deadlineWarningDays: number;
  /** Ngày nghỉ chưa được HR xác nhận — hiển thị cảnh báo trong Data Health/Lịch. */
  unconfirmedHolidayCount: number;
}

export const getBocContext = cache(async (): Promise<BocContext> => {
  const e = env();

  const [holidays, categories, levels, names] = await Promise.all([
    listHolidays(),
    categoryMap(),
    managementLevelMap(),
    resolveNames(),
  ]);

  const [maskName, capacityDaysPerWeek, hoursPerDay, nearThreshold, warningDays, rollupMode] =
    await Promise.all([
      getSystemSetting<'MON_SAT' | 'MON_FRI'>('work_week_mask', e.WORK_WEEK_MASK),
      getSystemSetting<number>('capacity_days_per_week', e.CAPACITY_DAYS_PER_WEEK),
      getSystemSetting<number>('default_capacity_hours_per_day', e.DEFAULT_CAPACITY_HOURS_PER_DAY),
      getSystemSetting<number>('near_capacity_threshold', e.NEAR_CAPACITY_THRESHOLD),
      getSystemSetting<number>('deadline_warning_business_days', e.DEADLINE_WARNING_BUSINESS_DAYS),
      getSystemSetting<ProgressRollupMode>('progress_rollup_mode', e.PROGRESS_ROLLUP_MODE),
    ]);

  const calendar = createCalendar(
    WORK_WEEK_MASKS[maskName] ?? WORK_WEEK_MASKS.MON_SAT,
    holidays.map((h) => h.holiday_date),
  );

  const capacity: CapacityConfig = {
    ...DEFAULT_CAPACITY,
    defaultHoursPerDay: hoursPerDay,
    capacityDaysPerWeek,
    nearCapacityThreshold: nearThreshold,
  };

  const categoryCodeOf = (item: WorkItem): CategoryCode | null =>
    (categories.get(item.category_id)?.code as CategoryCode | undefined) ?? null;

  const managementLevelCodeOf = (item: WorkItem): ManagementLevelCode | null =>
    (levels.get(item.management_level_id)?.code as ManagementLevelCode | undefined) ?? null;

  const progress: ProgressContext = { categoryOf: categoryCodeOf, mode: rollupMode };
  const today = businessClock.today();

  return {
    today,
    calendar,
    capacity,
    progress,
    metrics: {
      today,
      calendar,
      progress,
      deadlineWarningDays: warningDays,
      categoryCodeOf,
      managementLevelCodeOf,
    },
    categoryCodeOf,
    managementLevelCodeOf,
    names,
    rollupMode,
    deadlineWarningDays: warningDays,
    unconfirmedHolidayCount: holidays.filter((h) => !h.is_confirmed).length,
  };
});
