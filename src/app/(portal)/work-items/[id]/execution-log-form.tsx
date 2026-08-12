'use client';

import { useActionState, useState } from 'react';
import { ClipboardPlus } from 'lucide-react';

import { createExecutionLogAction } from '@/app/(portal)/work-items/actions';
import { EMPTY_FORM_STATE } from '@/app/(portal)/work-items/form-state';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Field, FormError, Input, Select, SubmitButton, Textarea } from '@/components/ui/form';
import { EXECUTION_STATUSES } from '@/domain/catalogs';
import type { ExecutionStatus } from '@/domain/types';

/**
 * Ghi một lần thực hiện — BR-REC-001…005.
 *
 * Trường “lý do bỏ qua” chỉ hiện khi chọn Bỏ qua, và “ngày hoàn thành” chỉ hiện khi chọn
 * Hoàn thành: bắt buộc đúng lúc cần, không bắt người dùng điền thừa.
 */
export function ExecutionLogForm({
  workItemId,
  defaultResponsible,
  today,
  defaultDue,
}: {
  workItemId: string;
  defaultResponsible: string;
  today: string;
  defaultDue: string | null;
}) {
  const [state, formAction] = useActionState(createExecutionLogAction, EMPTY_FORM_STATE);
  const [status, setStatus] = useState<ExecutionStatus>('COMPLETED');

  return (
    <Card>
      <CardHeader
        title="Ghi nhật ký thực hiện"
        description="Giờ thực tế trong báo cáo chỉ được cộng từ đây, không suy ra từ giờ ước tính."
      />
      <CardBody>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="work_item_id" value={workItemId} />
          <input type="hidden" name="responsible_user_id" value={defaultResponsible} />

          <FormError message={state.error} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kỳ bắt đầu" htmlFor="period_start" required>
              <Input id="period_start" name="period_start" type="date" defaultValue={today} required />
            </Field>
            <Field label="Kỳ kết thúc" htmlFor="period_end">
              <Input id="period_end" name="period_end" type="date" />
            </Field>
          </div>

          <Field
            label="Hạn của kỳ này"
            htmlFor="occurrence_due_at"
            hint="Dùng để đánh giá đúng hạn/trễ hạn theo từng kỳ."
          >
            <Input
              id="occurrence_due_at"
              name="occurrence_due_at"
              type="date"
              defaultValue={defaultDue ?? ''}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trạng thái kỳ" htmlFor="log-status" required>
              <Select
                id="log-status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ExecutionStatus)}
              >
                {EXECUTION_STATUSES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Giờ thực tế" htmlFor="actual_hours">
              <Input
                id="actual_hours"
                name="actual_hours"
                type="number"
                min={0}
                step={0.5}
                placeholder="0"
              />
            </Field>
          </div>

          {status === 'COMPLETED' ? (
            <Field label="Ngày hoàn thành kỳ" htmlFor="log-completed" required>
              <Input id="log-completed" name="completed_at" type="date" defaultValue={today} required />
            </Field>
          ) : null}

          {status === 'SKIPPED' ? (
            <Field label="Lý do bỏ qua" htmlFor="skip_reason" required>
              <Textarea id="skip_reason" name="skip_reason" rows={2} required />
            </Field>
          ) : null}

          <Field label="Ghi chú" htmlFor="log-note">
            <Textarea id="log-note" name="note" rows={2} />
          </Field>

          <SubmitButton pendingLabel="Đang ghi…">
            <ClipboardPlus aria-hidden className="size-4" />
            Ghi nhật ký
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
