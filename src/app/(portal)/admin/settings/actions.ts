'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireUser } from '@/server/auth/current-user';
import { getStore, type Row } from '@/server/db/store';
import type { SystemSetting } from '@/domain/types';
import { diffFields, recordAudit } from '@/server/services/audit';
import { toActionResult } from '@/server/services/errors';

import type { SettingsState } from './form-state';

/**
 * Cập nhật tham số hệ thống.
 *
 * Đây là nơi BOC chốt các quyết định trong `NEED_CONFIRMATION.md` mà **không cần deploy lại**:
 * lịch làm việc, số ngày quy đổi, ngưỡng cận tải, cách cuộn tiến độ. Mọi thay đổi đều audit
 * before/after vì chúng làm đổi con số trên toàn bộ báo cáo.
 */

const schema = z.object({
  work_week_mask: z.enum(['MON_SAT', 'MON_FRI']),
  capacity_days_per_week: z.coerce.number().min(1).max(7),
  default_capacity_hours_per_day: z.coerce.number().min(1).max(24),
  near_capacity_threshold: z.coerce.number().min(0.1).max(1),
  deadline_warning_business_days: z.coerce.number().int().min(1).max(60),
  progress_rollup_mode: z.enum(['average', 'weighted']),
  reason: z.string().trim().min(3, 'Ghi lý do thay đổi để lưu vào audit log'),
});

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  if (!user.capabilities.has('settings.manage')) {
    return { error: 'Bạn không có quyền sửa tham số hệ thống.', success: null };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.', success: null };
  }

  const { reason, ...values } = parsed.data;

  try {
    const store = await getStore();
    const existing = await store.all<Row & SystemSetting>('system_settings');
    const byKey = new Map(existing.map((s) => [s.key, s]));
    const changed: string[] = [];

    for (const [key, value] of Object.entries(values)) {
      const current = byKey.get(key);
      const nextJson = JSON.stringify(value);
      if (!current) continue;
      if (current.value_json === nextJson) continue;

      const updated = await store.update<Row & SystemSetting>('system_settings', current.id, {
        value_json: nextJson,
        updated_by: user.actor.user_id,
        version: current.version + 1,
      });
      changed.push(key);

      await recordAudit({
        actorUserId: user.actor.user_id,
        action: 'settings.update',
        entityType: 'system_setting',
        entityId: current.id,
        before: current,
        after: updated,
        changedFields: diffFields(
          current as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>,
        ),
        reason,
      });
    }

    if (changed.length === 0) {
      return { error: null, success: 'Không có tham số nào thay đổi.' };
    }

    // Đổi tham số làm đổi mọi con số dẫn xuất ⇒ làm mới toàn bộ màn hình phân tích.
    for (const path of ['/dashboard', '/workload', '/reports', '/work-items', '/calendar', '/my-work']) {
      revalidatePath(path);
    }
    revalidatePath('/admin/settings');

    return {
      error: null,
      success: `Đã cập nhật ${changed.length} tham số: ${changed.join(', ')}. Các chỉ số dẫn xuất sẽ tính lại ở lần tải kế tiếp.`,
    };
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
}
