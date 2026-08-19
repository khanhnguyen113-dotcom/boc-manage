'use client';

import { useActionState, useState } from 'react';

import { changeStatusAction } from '@/app/(portal)/work-items/actions';
import { EMPTY_FORM_STATE } from '@/app/(portal)/work-items/form-state';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Field, FormError, Select, SubmitButton, Textarea } from '@/components/ui/form';
import { WORK_STATUS_BY_CODE } from '@/domain/catalogs';
import { allowedNextStatuses, isSensitiveTransition } from '@/domain/status';
import type { WorkItem, WorkStatus } from '@/domain/types';

/**
 * Đổi trạng thái có kiểm soát.
 *
 * Danh sách trạng thái đích lấy từ đúng bảng transition của domain, nên UI không bao giờ mời
 * người dùng làm một bước mà server sẽ từ chối. Lý do bắt buộc cho thao tác nhạy cảm được yêu
 * cầu ngay tại form thay vì để server báo lỗi sau.
 */
export function StatusPanel({
  item,
}: {
  item: WorkItem;
}) {
  const [state, formAction] = useActionState(changeStatusAction, EMPTY_FORM_STATE);
  const [target, setTarget] = useState<WorkStatus>(item.status);

  const options = allowedNextStatuses(item.status).filter((status) => status !== 'COMPLETED');
  if (options.length === 0) return null;

  const sensitive = isSensitiveTransition(item.status, target);
  const requiresReason = sensitive || target === 'CANCELLED';

  return (
    <Card>
      <CardHeader
        title="Chuyển trạng thái"
        description={`Đang ở “${WORK_STATUS_BY_CODE[item.status].label}”. Chỉ hiện các bước hợp lệ theo quy tắc nghiệp vụ.`}
      />
      <CardBody>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="expected_version" value={item.version} />

          <FormError message={state.error} details={state.details} />

          <Field label="Trạng thái mới" htmlFor="target-status" required>
            <Select
              id="target-status"
              name="status"
              value={target}
              onChange={(event) => setTarget(event.target.value as WorkStatus)}
            >
              <option value={item.status}>Giữ nguyên</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {WORK_STATUS_BY_CODE[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Lý do"
            htmlFor="reason"
            required={requiresReason}
            hint={
              requiresReason
                ? 'Thao tác nhạy cảm — lý do được ghi vào audit log.'
                : 'Không bắt buộc, nhưng giúp người khác hiểu bối cảnh.'
            }
          >
            <Textarea id="reason" name="reason" rows={2} required={requiresReason} />
          </Field>

          <SubmitButton pendingLabel="Đang chuyển…">Xác nhận chuyển trạng thái</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
