'use client';

import { useActionState } from 'react';
import { LogIn } from 'lucide-react';

import { Field, FormError, Input, SubmitButton } from '@/components/ui/form';

import { loginAction, type LoginState } from './actions';

const INITIAL: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />

      <Field label="Email công ty" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="ten.ban@boc.local"
          aria-describedby={state.error ? undefined : 'email-hint'}
        />
      </Field>

      <Field label="Mật khẩu" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton pendingLabel="Đang đăng nhập…" className="w-full">
        <LogIn aria-hidden className="size-4" />
        Đăng nhập
      </SubmitButton>
    </form>
  );
}
