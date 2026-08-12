'use client';

import { useActionState } from 'react';
import { Save } from 'lucide-react';

import { Alert, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Field, FormError, Input, Select, SubmitButton, Textarea } from '@/components/ui/form';

import { updateSettingsAction } from './actions';
import { EMPTY_SETTINGS_STATE } from './form-state';

export interface SettingsValues {
  work_week_mask: string;
  capacity_days_per_week: number;
  default_capacity_hours_per_day: number;
  near_capacity_threshold: number;
  deadline_warning_business_days: number;
  progress_rollup_mode: string;
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, formAction] = useActionState(updateSettingsAction, EMPTY_SETTINGS_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      {state.success ? <Alert tone="info" title={state.success} /> : null}

      <Card>
        <CardHeader
          title="Lịch làm việc"
          description="Ảnh hưởng trực tiếp tới “còn bao nhiêu ngày”, quá hạn và mọi mốc cảnh báo."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Tuần làm việc"
            htmlFor="work_week_mask"
            required
            hint="Sheet nguồn dùng NETWORKDAYS.INTL loại Chủ nhật ⇒ tương ứng “Thứ 2 – Thứ 7”."
          >
            <Select id="work_week_mask" name="work_week_mask" defaultValue={values.work_week_mask}>
              <option value="MON_SAT">Thứ 2 – Thứ 7 (loại Chủ nhật)</option>
              <option value="MON_FRI">Thứ 2 – Thứ 6 (loại Thứ 7 và Chủ nhật)</option>
            </Select>
          </Field>

          <Field
            label="Số ngày quy đổi giờ/tuần"
            htmlFor="capacity_days_per_week"
            required
            hint="Sheet đang chia 5 dù tuần làm việc 6 ngày — mâu thuẫn cần BOC chốt."
          >
            <Input
              id="capacity_days_per_week"
              name="capacity_days_per_week"
              type="number"
              min={1}
              max={7}
              defaultValue={values.capacity_days_per_week}
            />
          </Field>

          <Field label="Ngưỡng cảnh báo sắp đến hạn (ngày làm việc)" htmlFor="deadline_warning_business_days" required>
            <Input
              id="deadline_warning_business_days"
              name="deadline_warning_business_days"
              type="number"
              min={1}
              max={60}
              defaultValue={values.deadline_warning_business_days}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Công suất và ngưỡng tải"
          description="Quyết định khi nào một người bị đánh dấu cận tải hoặc quá tải."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Công suất chuẩn (giờ/ngày)" htmlFor="default_capacity_hours_per_day" required>
            <Input
              id="default_capacity_hours_per_day"
              name="default_capacity_hours_per_day"
              type="number"
              min={1}
              max={24}
              step={0.5}
              defaultValue={values.default_capacity_hours_per_day}
            />
          </Field>

          <Field
            label="Ngưỡng cận tải (0–1)"
            htmlFor="near_capacity_threshold"
            required
            hint="Danh mục của Sheet ghi 0.80, các sheet báo cáo ghi 0.85 — đang áp dụng giá trị dưới đây."
          >
            <Input
              id="near_capacity_threshold"
              name="near_capacity_threshold"
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              defaultValue={values.near_capacity_threshold}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Cách cuộn tiến độ"
          description="Đổi giá trị này làm thay đổi tiến độ của mọi công việc cha trong toàn hệ thống."
        />
        <CardBody>
          <Field
            label="Chế độ"
            htmlFor="progress_rollup_mode"
            required
            hint="“Trung bình đều” khớp công thức AVERAGEIFS của Sheet và giữ khả năng đối soát khi import."
          >
            <Select
              id="progress_rollup_mode"
              name="progress_rollup_mode"
              defaultValue={values.progress_rollup_mode}
            >
              <option value="average">Trung bình đều các công việc con hợp lệ</option>
              <option value="weighted">Trung bình có trọng số theo khối lượng giờ</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <Field
            label="Lý do thay đổi"
            htmlFor="reason"
            required
            hint="Bắt buộc — được ghi vào audit log cùng giá trị trước/sau."
          >
            <Textarea
              id="reason"
              name="reason"
              rows={2}
              required
              placeholder="Ví dụ: Biên bản họp BOC ngày 20/08/2026 chốt tuần làm việc 6 ngày."
            />
          </Field>

          <SubmitButton pendingLabel="Đang lưu…">
            <Save aria-hidden className="size-4" />
            Lưu tham số
          </SubmitButton>
        </CardBody>
      </Card>
    </form>
  );
}
