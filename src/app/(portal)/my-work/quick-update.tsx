'use client';

import { useActionState, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { quickUpdateAction } from '@/app/(portal)/work-items/actions';
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
export function QuickUpdate({ item, today }: { item: WorkItem; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(quickUpdateAction, EMPTY_FORM_STATE);
  const [status, setStatus] = useState(item.status);

  const nextStatuses = [item.status, ...allowedNextStatuses(item.status)].filter(
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)]"
      >
        Cập nhật
        <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

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

          {status === 'COMPLETED' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Ngày hoàn thành thực tế"
                htmlFor={`completed-${item.id}`}
                required
                hint="Bắt buộc khi chuyển sang Hoàn thành."
              >
                <Input
                  id={`completed-${item.id}`}
                  name="completed_at"
                  type="date"
                  defaultValue={today}
                />
              </Field>
              <Field
                label="Link kết quả"
                htmlFor={`link-${item.id}`}
                required
                hint="Cần link hoặc tệp kết quả làm bằng chứng."
              >
                <Input
                  id={`link-${item.id}`}
                  name="result_link"
                  type="url"
                  defaultValue={item.result_link ?? ''}
                  placeholder="https://…"
                />
              </Field>
            </div>
          ) : null}

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
    </div>
  );
}
