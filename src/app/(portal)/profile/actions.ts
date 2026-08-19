'use server';

import { changeOwnPasswordSchema } from '@/schemas/user';
import { requireUser } from '@/server/auth/current-user';
import { toActionResult } from '@/server/services/errors';
import { changeOwnPassword } from '@/server/services/users';

import type { ProfileFormState } from './form-state';

export async function changeOwnPasswordAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const parsed = changeOwnPasswordSchema.safeParse({
    current_password: String(formData.get('current_password') ?? ''),
    password: String(formData.get('password') ?? ''),
    password_confirm: String(formData.get('password_confirm') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'Thông tin mật khẩu chưa hợp lệ.', success: null, fieldErrors };
  }

  try {
    await changeOwnPassword(user, parsed.data.current_password, parsed.data.password);
    return { error: null, success: 'Đã đổi mật khẩu thành công.' };
  } catch (error) {
    return { error: toActionResult(error).message, success: null };
  }
}
