'use client';

import { useActionState } from 'react';
import { CheckCircle2, Clock3, RotateCcw } from 'lucide-react';

import { reviewCompletionAction, submitCompletionAction } from '@/app/(portal)/work-items/actions';
import { EMPTY_FORM_STATE } from '@/app/(portal)/work-items/form-state';
import { Field, FormError, Input, SubmitButton, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import type { WorkItem } from '@/domain/types';

export function CompletionPanel({
  item,
  today,
  canSubmit,
  canReview,
  submitterName,
  reviewerName,
}: {
  item: WorkItem;
  today: string;
  canSubmit: boolean;
  canReview: boolean;
  submitterName: string;
  reviewerName: string;
}) {
  const [submitState, submitAction] = useActionState(submitCompletionAction, EMPTY_FORM_STATE);
  const [reviewState, reviewAction] = useActionState(reviewCompletionAction, EMPTY_FORM_STATE);
  const approval = item.completion_approval_status ?? 'NONE';

  if (approval === 'APPROVED' && item.status === 'COMPLETED') {
    return (
      <Card>
        <CardHeader icon={CheckCircle2} title="Kết quả đã được xác nhận" />
        <CardBody className="space-y-2 text-sm text-[var(--text-muted)]">
          <p>Người gửi: <strong className="text-[var(--text)]">{submitterName}</strong></p>
          <p>Người xác nhận: <strong className="text-[var(--text)]">{reviewerName}</strong></p>
          {item.completion_review_note ? <p>Ý kiến: {item.completion_review_note}</p> : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={approval === 'PENDING' ? Clock3 : RotateCcw}
        title="Kết quả hoàn thành"
        description="Người thực hiện gửi ngày thực tế và kết quả; người phụ trách hoặc quản lý xác nhận trước khi hệ thống ghi nhận hoàn thành."
      />
      <CardBody className="space-y-4">
        {approval === 'PENDING' ? (
          <Alert tone="warning" title="Đang chờ xác nhận">
            {submitterName} đã gửi ngày hoàn thành và kết quả. Công việc chưa được tính là hoàn thành.
          </Alert>
        ) : null}
        {approval === 'REJECTED' ? (
          <Alert tone="danger" title="Kết quả đã được trả lại">
            {item.completion_review_note || 'Cần bổ sung thông tin trước khi gửi lại.'}
          </Alert>
        ) : null}
        <FormError message={submitState.error} details={submitState.details} />
        {submitState.success ? <Alert tone="info" title={submitState.success} /> : null}
        <FormError message={reviewState.error} details={reviewState.details} />
        {reviewState.success ? <Alert tone="info" title={reviewState.success} /> : null}

        {canSubmit && approval !== 'PENDING' ? (
          <form action={submitAction} className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="expected_version" value={item.version} />
            <div className="flex items-center gap-2">
              <Badge tone="info">Bước 1</Badge>
              <p className="text-sm font-semibold">Người thực hiện gửi kết quả</p>
            </div>
            <Field label="Ngày hoàn thành thực tế" htmlFor={`submit-completed-${item.id}`} required>
              <Input id={`submit-completed-${item.id}`} name="completed_at" type="date" max={today} defaultValue={item.submitted_completed_at ?? today} required />
            </Field>
            <Field label="Link kết quả" htmlFor={`submit-result-${item.id}`} hint="Cần link hoặc tệp kết quả đã tải lên công việc.">
              <Input id={`submit-result-${item.id}`} name="result_link" type="url" defaultValue={item.submitted_result_link ?? item.result_link ?? ''} placeholder="https://…" />
            </Field>
            <Field label="Ghi chú bàn giao" htmlFor={`submit-note-${item.id}`}>
              <Textarea id={`submit-note-${item.id}`} name="note" rows={2} />
            </Field>
            <SubmitButton pendingLabel="Đang gửi…">Gửi hoàn thành</SubmitButton>
          </form>
        ) : null}

        {canReview && approval === 'PENDING' ? (
          <form action={reviewAction} className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="expected_version" value={item.version} />
            <div className="flex items-center gap-2">
              <Badge tone="strategic">Bước 2</Badge>
              <p className="text-sm font-semibold">Người phụ trách xác nhận</p>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Ngày người thực hiện gửi: <strong>{item.submitted_completed_at}</strong>
              {item.submitted_result_link ? <> · <a href={item.submitted_result_link} target="_blank" rel="noreferrer" className="underline">Mở kết quả</a></> : null}
            </p>
            <Field label="Ý kiến xác nhận / lý do trả lại" htmlFor={`review-note-${item.id}`}>
              <Textarea id={`review-note-${item.id}`} name="note" rows={2} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="decision" value="APPROVE" pendingLabel="Đang xác nhận…">Xác nhận hoàn thành</SubmitButton>
              <SubmitButton name="decision" value="REJECT" variant="danger" pendingLabel="Đang trả lại…">Trả lại để bổ sung</SubmitButton>
            </div>
          </form>
        ) : null}

        {!canSubmit && !canReview && approval !== 'APPROVED' ? (
          <p className="text-xs text-[var(--text-muted)]">Chỉ người thực hiện được gửi kết quả; người phụ trách hoặc quản lý mới được xác nhận.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
