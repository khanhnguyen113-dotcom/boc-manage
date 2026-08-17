'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  changeUserPasswordSchema,
  createUserSchema,
  deleteUserSchema,
  updateUserSchema,
} from '@/schemas/user';
import { requireCapability } from '@/server/auth/current-user';
import { toActionResult } from '@/server/services/errors';
import {
  changeUserPassword,
  createUserAccount,
  deleteUserAccount,
  updateUserAccount,
} from '@/server/services/users';

import type { UserFormState } from './form-state';

function optionalString(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function issuesToState(issues: { path: PropertyKey[]; message: string }[]): UserFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: 'Thông tin tài khoản chưa hợp lệ.', success: null, fieldErrors };
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
    return issuesToState(parsed.error.issues);
  }

  try {
    await createUserAccount(actor, parsed.data);
    revalidatePath('/admin/users');
    return { error: null, success: `Đã tạo tài khoản ${parsed.data.email}.` };
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
}


export async function updateUserAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requireCapability('user.manage');
  const capacityText = optionalString(formData.get('capacity_hours_per_day'));
  const parsed = updateUserSchema.safeParse({
    user_id: String(formData.get('user_id') ?? ''),
    full_name: String(formData.get('full_name') ?? ''),
    email: String(formData.get('email') ?? ''),
    employee_code: optionalString(formData.get('employee_code')),
    job_title: optionalString(formData.get('job_title')),
    primary_unit_id: optionalString(formData.get('primary_unit_id')),
    role_code: String(formData.get('role_code') ?? 'member'),
    scope_type: String(formData.get('scope_type') ?? 'SELF_ASSIGNED'),
    scope_unit_id: optionalString(formData.get('scope_unit_id')),
    capacity_hours_per_day: capacityText ? Number(capacityText.replace(',', '.')) : null,
    status: String(formData.get('status') ?? 'ACTIVE'),
  });
  if (!parsed.success) return issuesToState(parsed.error.issues);

  try {
    await updateUserAccount(actor, parsed.data);
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${parsed.data.user_id}`);
    return { error: null, success: 'Đã cập nhật hồ sơ, quyền và trạng thái tài khoản.' };
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
}

export async function changeUserPasswordAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requireCapability('user.manage');
  const parsed = changeUserPasswordSchema.safeParse({
    user_id: String(formData.get('user_id') ?? ''),
    password: String(formData.get('password') ?? ''),
    password_confirm: String(formData.get('password_confirm') ?? ''),
  });
  if (!parsed.success) return issuesToState(parsed.error.issues);

  try {
    await changeUserPassword(actor, parsed.data.user_id, parsed.data.password);
    return { error: null, success: 'Đã đổi mật khẩu và đăng xuất toàn bộ phiên của tài khoản.' };
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
}

export async function deleteUserAction(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requireCapability('user.manage');
  const parsed = deleteUserSchema.safeParse({
    user_id: String(formData.get('user_id') ?? ''),
    confirmation: String(formData.get('confirmation') ?? ''),
  });
  if (!parsed.success) return issuesToState(parsed.error.issues);

  try {
    await deleteUserAccount(actor, parsed.data.user_id);
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
  revalidatePath('/admin/users');
  redirect('/admin/users?deleted=1');
}
