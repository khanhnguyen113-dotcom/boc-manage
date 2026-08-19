'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';

import { deleteWorkItemAction } from '@/app/(portal)/work-items/actions';
import { EMPTY_FORM_STATE } from '@/app/(portal)/work-items/form-state';
import { Field, FormError, Input, SubmitButton, Textarea } from '@/components/ui/form';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/primitives';

export function DeleteWorkItemPanel({ id, version }: { id: string; version: number }) {
  const [state, action] = useActionState(deleteWorkItemAction, EMPTY_FORM_STATE);
  return (
    <Card className="border-[var(--tone-danger-border)]">
      <CardHeader icon={Trash2} title="Xóa công việc" description="Chỉ quản lý, quản trị nghiệp vụ hoặc Giám đốc BOC được thực hiện." />
      <CardBody>
        <Alert tone="danger" title="Toàn bộ nhánh sẽ bị xóa khỏi các màn hình">
          Công việc con đi cùng nhánh cũng bị xóa an toàn. Hệ thống vẫn giữ audit để truy vết và không làm mất lịch sử quản trị.
        </Alert>
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="expected_version" value={version} />
          <FormError message={state.error} />
          <Field label="Lý do xóa" htmlFor="delete_reason" required error={state.fieldErrors?.reason}>
            <Textarea id="delete_reason" name="reason" rows={2} required />
          </Field>
          <Field label={<>Nhập <strong>XOA</strong> để xác nhận</>} htmlFor="delete_confirmation" required error={state.fieldErrors?.confirmation}>
            <Input id="delete_confirmation" name="confirmation" autoComplete="off" required />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Đang xóa…">Xóa công việc và nhánh con</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
