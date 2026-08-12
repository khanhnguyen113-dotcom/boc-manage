'use server';

import { redirect } from 'next/navigation';

import { loginSchema } from '@/schemas/work-item';
import { login, logout } from '@/server/auth/login';

export interface LoginState {
  error: string | null;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' };
  }

  const result = await login(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: result.message };

  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/login');
}
