'use client';

import { useActionState } from 'react';
import { KeyRound } from 'lucide-react';

import { Field, FormError, Input, SubmitButton } from '@/components/ui/form';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/primitives';

import { changeOwnPasswordAction } from './actions';
import { EMPTY_PROFILE_FORM_STATE } from './form-state';

export function PasswordForm() {
  const [state, action] = useActionState(changeOwnPasswordAction, EMPTY_PROFILE_FORM_STATE);
  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        title="Đổi mật khẩu"
        description="Nhập mật khẩu hiện tại để xác minh, sau đó đặt mật khẩu mới tối thiểu 8 ký tự."
      />
      <CardBody>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormError message={state.error} />
            {state.success ? <Alert tone="info" title={state.success} /> : null}
          </div>
          <Field label="Mật khẩu hiện tại" htmlFor="current_password" required error={state.fieldErrors?.current_password}>
            <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
          </Field>
          <span aria-hidden className="hidden sm:block" />
          <Field label="Mật khẩu mới" htmlFor="new_password" required error={state.fieldErrors?.password}>
            <Input id="new_password" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
          </Field>
          <Field label="Nhập lại mật khẩu mới" htmlFor="password_confirm" required error={state.fieldErrors?.password_confirm}>
            <Input id="password_confirm" name="password_confirm" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Đang đổi…">Đổi mật khẩu</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
