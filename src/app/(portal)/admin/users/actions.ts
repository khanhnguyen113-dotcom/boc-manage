'use server';

import { revalidatePath } from 'next/cache';

import { createUserSchema } from '@/schemas/user';
import { requireCapability } from '@/server/auth/current-user';
import { toActionResult } from '@/server/services/errors';
import { createUserAccount } from '@/server/services/users';

import type { UserFormState } from './form-state';

function optionalString(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

export async function createUserAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requireCapability('user.manage');
  const capacityText = optionalString(formData.get('capacity_hours_per_day'));
  const parsed = createUserSchema.safeParse({
    full_name: String(formData.get('full_name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    employee_code: optionalString(formData.get('employee_code')),
    job_title: optionalString(formData.get('job_title')),
    primary_unit_id: optionalString(formData.get('primary_unit_id')),
    role_code: String(formData.get('role_code') ?? 'member'),
    scope_type: String(formData.get('scope_type') ?? 'SELF_ASSIGNED'),
    scope_unit_id: optionalString(formData.get('scope_unit_id')),
    capacity_hours_per_day: capacityText ? Number(capacityText.replace(',', '.')) : null,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'Thông tin tài khoản chưa hợp lệ.', success: null, fieldErrors };
  }

  try {
    await createUserAccount(actor, parsed.data);
    revalidatePath('/admin/users');
    return { error: null, success: `Đã tạo tài khoản ${parsed.data.email}.` };
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
}
