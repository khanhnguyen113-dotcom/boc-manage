import type { Metadata } from 'next';

import { Alert, PageHeader } from '@/components/ui/primitives';
import { requireCapability } from '@/server/auth/current-user';
import { getSystemSetting } from '@/server/repositories/catalogs';

import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Tham số hệ thống' };

export default async function AdminSettingsPage() {
  await requireCapability('settings.manage');

  const [
    workWeekMask,
    capacityDaysPerWeek,
    defaultCapacity,
    nearThreshold,
    warningDays,
    rollupMode,
  ] = await Promise.all([
    getSystemSetting<string>('work_week_mask', 'MON_SAT'),
    getSystemSetting<number>('capacity_days_per_week', 5),
    getSystemSetting<number>('default_capacity_hours_per_day', 8),
    getSystemSetting<number>('near_capacity_threshold', 0.85),
    getSystemSetting<number>('deadline_warning_business_days', 7),
    getSystemSetting<string>('progress_rollup_mode', 'average'),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Tham số hệ thống"
        description="Những giá trị dưới đây là các quyết định nghiệp vụ chưa được BOC chốt chính thức. Sửa ở đây có hiệu lực ngay, không cần deploy lại."
      />

      <Alert tone="warning" title="Thay đổi ở đây làm đổi số liệu toàn hệ thống">
        Lịch làm việc, số ngày quy đổi và cách cuộn tiến độ ảnh hưởng tới mọi chỉ số trên Control
        Tower, báo cáo và file export. Chỉ đổi khi có biên bản/quyết định của Product Owner, và
        luôn ghi lý do — hệ thống lưu giá trị trước/sau vào audit log.
      </Alert>

      <SettingsForm
        values={{
          work_week_mask: workWeekMask,
          capacity_days_per_week: capacityDaysPerWeek,
          default_capacity_hours_per_day: defaultCapacity,
          near_capacity_threshold: nearThreshold,
          deadline_warning_business_days: warningDays,
          progress_rollup_mode: rollupMode,
        }}
      />
    </div>
  );
}
