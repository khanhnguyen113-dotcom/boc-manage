'use client';

import { useActionState, useState } from 'react';
import { Check, CheckCircle2, ChevronDown } from 'lucide-react';

import { quickUpdateAction, submitCompletionAction } from '@/app/(portal)/work-items/actions';
import { EMPTY_FORM_STATE } from '@/app/(portal)/work-items/form-state';
import { Field, FormError, Input, Select, SubmitButton, Textarea } from '@/components/ui/form';
import { Badge } from '@/components/ui/primitives';
import { allowedNextStatuses } from '@/domain/status';
import { WORK_STATUS_BY_CODE } from '@/domain/catalogs';
import type { WorkItem } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * Cập nhật nhanh — guideline 6.3: giảm số thao tác báo tiến độ hằng ngày.
 *
 * Form mở ngay trong danh sách, không phải mở trang chi tiết. Chỉ chứa các trường mà người thực
 * hiện được phép đổi; mọi rule (leaf-only, transition, evidence) vẫn kiểm ở server.
 */
export function QuickUpdate({ item, today, canSubmitCompletion }: { item: WorkItem; today: string; canSubmitCompletion: boolean }) {
  const [open, setOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [state, formAction] = useActionState(quickUpdateAction, EMPTY_FORM_STATE);
  const [completionState, completionAction] = useActionState(submitCompletionAction, EMPTY_FORM_STATE);
  const [status, setStatus] = useState(item.status);

  const nextStatuses = [item.status, ...allowedNextStatuses(item.status)].filter(
    (value) => value !== 'COMPLETED',
  ).filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  if (!item.is_leaf) {
    return (
      <Badge tone="muted" title="Tiến độ của công việc này được tính từ các công việc con">
        Tính từ việc con
      </Badge>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)]"
        >
          Cập nhật
          <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {item.completion_approval_status === 'PENDING' ? (
          <Badge tone="warning">Đang chờ duyệt kết quả</Badge>
        ) : canSubmitCompletion ? (
          <button
            type="button"
            onClick={() => setCompletionOpen((value) => !value)}
            aria-expanded={completionOpen}
            className="inline-flex items-center gap-1 rounded-[var(--radius)] bg-[var(--brand-600)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-700)]"
          >
            <CheckCircle2 aria-hidden className="size-3.5" />
            Gửi hoàn thành
          </button>
        ) : null}
      </div>

      {open ? (
        <form
          action={formAction}
          className="animate-in mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3"
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="expected_version" value={item.version} />

          <FormError message={state.error} details={state.details} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tiến độ (%)" htmlFor={`progress-${item.id}`}>
              <Input
                id={`progress-${item.id}`}
                name="manual_progress"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={item.manual_progress ?? ''}
                placeholder="0–100"
              />
            </Field>

            <Field label="Trạng thái" htmlFor={`status-${item.id}`}>
              <Select
                id={`status-${item.id}`}
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as WorkItem['status'])}
              >
                {nextStatuses.map((value) => (
                  <option key={value} value={value}>
                    {WORK_STATUS_BY_CODE[value].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Ghi chú / khó khăn"
            htmlFor={`note-${item.id}`}
            hint="Được lưu vào lịch sử thay đổi để quản lý nắm bối cảnh."
          >
            <Textarea id={`note-${item.id}`} name="note" rows={2} />
          </Field>

          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel="Đang lưu…">
              <Check aria-hidden className="size-4" />
              Lưu cập nhật
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-[var(--text-muted)] hover:underline"
            >
              Đóng
            </button>
          </div>
        </form>
      ) : null}

      {completionOpen && canSubmitCompletion && item.completion_approval_status !== 'PENDING' ? (
        <form action={completionAction} className="animate-in mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--brand-300)] bg-[var(--surface-sunken)] p-3">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="expected_version" value={item.version} />
          <FormError message={completionState.error} details={completionState.details} />
          {completionState.success ? <Badge tone="success">{completionState.success}</Badge> : null}
          {item.completion_approval_status === 'REJECTED' && item.completion_review_note ? (
            <Badge tone="danger">Cần bổ sung: {item.completion_review_note}</Badge>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày hoàn thành thực tế" htmlFor={`submit-completed-${item.id}`} required>
              <Input id={`submit-completed-${item.id}`} name="completed_at" type="date" max={today} defaultValue={item.submitted_completed_at ?? today} required />
            </Field>
            <Field label="Link kết quả" htmlFor={`submit-link-${item.id}`} hint="Cần link hoặc tệp kết quả đã tải lên.">
              <Input id={`submit-link-${item.id}`} name="result_link" type="url" defaultValue={item.submitted_result_link ?? item.result_link ?? ''} placeholder="https://…" />
            </Field>
          </div>
          <Field label="Ghi chú bàn giao" htmlFor={`submit-note-${item.id}`}>
            <Textarea id={`submit-note-${item.id}`} name="note" rows={2} />
          </Field>
          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel="Đang gửi…">Gửi người phụ trách xác nhận</SubmitButton>
            <button type="button" onClick={() => setCompletionOpen(false)} className="text-xs text-[var(--text-muted)] hover:underline">Đóng</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
