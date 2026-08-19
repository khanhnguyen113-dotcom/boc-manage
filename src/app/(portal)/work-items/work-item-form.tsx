'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Save } from 'lucide-react';

import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Field, FormError, Input, Select, SubmitButton, Textarea } from '@/components/ui/form';
import {
  ALLOCATION_UNITS,
  PRIORITIES,
  RECURRENCE_CYCLES,
  SCHEDULE_TYPES,
  WORK_STATUSES,
} from '@/domain/catalogs';
import type { ScheduleType, WorkItem, WorkLevel } from '@/domain/types';

import { createWorkItemAction, updateWorkItemAction } from './actions';
import { EMPTY_FORM_STATE, type FormState } from './form-state';

export interface FormOption {
  value: string;
  label: string;
}

export interface WorkItemFormProps {
  mode: 'create' | 'edit';
  item?: WorkItem;
  units: FormOption[];
  people: FormOption[];
  managementLevels: FormOption[];
  categories: FormOption[];
  parents: { id: string; code: string; title: string; level: WorkLevel }[];
  defaultYear: number;
  defaultLevel?: WorkLevel;
  defaultParentId?: string;
}

/**
 * Form tạo/sửa công việc — guideline 6.2 “Form sections”.
 *
 * Bố cục theo 6 khối nghiệp vụ thay vì đổ một danh sách 25 trường: Phân tầng · Nội dung ·
 * Trách nhiệm · Kế hoạch · Nguồn lực · Thực hiện. Trường phụ thuộc (chu kỳ, ngày) chỉ hiện khi
 * loại lịch tương ứng được chọn.
 */
export function WorkItemForm(props: WorkItemFormProps) {
  const { mode, item } = props;
  const action = mode === 'create' ? createWorkItemAction : updateWorkItemAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, EMPTY_FORM_STATE);

  const [level, setLevel] = useState<WorkLevel>(item?.level ?? props.defaultLevel ?? 3);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    item?.schedule_type ?? 'DEADLINE',
  );
  const [parentId, setParentId] = useState(item?.parent_id ?? props.defaultParentId ?? '');

  const parentLevel = level === 3 ? null : ((level - 1) as WorkLevel);
  const parentOptions = props.parents.filter((p) => p.level === parentLevel);
  const availableLevels = [...new Set([3, ...props.parents.map((parent) => parent.level + 1), item?.level])]
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);
  const err = (field: string) => state.fieldErrors?.[field] ?? null;

  return (
    <form action={formAction} className="space-y-4">
      {mode === 'edit' && item ? (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="expected_version" value={item.version} />
        </>
      ) : null}

      <FormError message={state.error} details={state.details} />

      {/* 1. Phân tầng ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="1. Phân tầng"
          description="Chọn đúng cấp và công việc cha trước — các trường còn lại kế thừa năm, Lớp 1 và Lớp 2 từ cha."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cấp công việc" htmlFor="level" required error={err('level')}>
            <Select
              id="level"
              name="level"
              value={level}
              onChange={(event) => {
                setLevel(Number(event.target.value) as WorkLevel);
                setParentId('');
              }}
            >
              {availableLevels.map((value) => (
                <option key={value} value={value}>
                  {workLevelOptionLabel(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Công việc cha"
            htmlFor="parent_id"
            required={level !== 3}
            error={err('parent_id')}
            hint={level === 3 ? 'Công việc L3 không có cha.' : `Phải là một công việc L${parentLevel}.`}
            className="sm:col-span-2"
          >
            <Select
              id="parent_id"
              name="parent_id"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              disabled={level === 3}
              required={level !== 3}
            >
              <option value="">{level === 3 ? '— Không áp dụng —' : '— Chọn công việc cha —'}</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.code} · {parent.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Năm" htmlFor="year" required error={err('year')}>
            <Input
              id="year"
              name="year"
              type="number"
              min={2020}
              max={2100}
              defaultValue={item?.year ?? props.defaultYear}
              required
            />
          </Field>

          <Field
            label="Lớp 1 — cấp quản trị"
            htmlFor="management_level_id"
            required
            error={err('management_level_id')}
            className="sm:col-span-2"
          >
            <Select
              id="management_level_id"
              name="management_level_id"
              defaultValue={item?.management_level_id ?? props.managementLevels[0]?.value}
              required
            >
              {props.managementLevels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Lớp 2 — nhóm công việc"
            htmlFor="category_id"
            required
            error={err('category_id')}
            className="sm:col-span-2"
          >
            <Select
              id="category_id"
              name="category_id"
              defaultValue={item?.category_id ?? props.categories[0]?.value}
              required
            >
              {props.categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {/* 2. Nội dung ----------------------------------------------------- */}
      <Card>
        <CardHeader
          title="2. Nội dung"
          description="Kết quả đầu ra là bắt buộc khi hoàn thành — nhập sớm sẽ đỡ vướng lúc đóng việc."
        />
        <CardBody className="space-y-4">
          <Field label="Tên công việc" htmlFor="title" required error={err('title')}>
            <Input id="title" name="title" defaultValue={item?.title ?? ''} required maxLength={500} />
          </Field>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label="Kết quả đầu ra"
              htmlFor="expected_output"
              hint="Sản phẩm cụ thể phải đạt được, ví dụ “Biên bản được TGĐ phê duyệt”."
              error={err('expected_output')}
            >
              <Textarea
                id="expected_output"
                name="expected_output"
                rows={3}
                defaultValue={item?.expected_output ?? ''}
              />
            </Field>

            <Field label="Giá trị mang lại" htmlFor="value_contribution">
              <Textarea
                id="value_contribution"
                name="value_contribution"
                rows={3}
                defaultValue={item?.value_contribution ?? ''}
              />
            </Field>
          </div>

          <Field label="Mô tả chi tiết" htmlFor="description">
            <Textarea id="description" name="description" rows={3} defaultValue={item?.description ?? ''} />
          </Field>
        </CardBody>
      </Card>

      {/* 3. Trách nhiệm --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="3. Trách nhiệm"
          description="Điểm cuối bắt buộc có người thực hiện, nếu không sẽ bị đánh dấu thiếu dữ liệu."
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Đơn vị phụ trách" htmlFor="owning_unit_id" required error={err('owning_unit_id')}>
            <Select
              id="owning_unit_id"
              name="owning_unit_id"
              defaultValue={item?.owning_unit_id ?? props.units[0]?.value}
              required
            >
              {props.units.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Người Lead" htmlFor="lead_user_id">
            <Select id="lead_user_id" name="lead_user_id" defaultValue={item?.lead_user_id ?? ''}>
              <option value="">— Chưa gán —</option>
              {props.people.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Người thực hiện" htmlFor="primary_assignee_id">
            <Select
              id="primary_assignee_id"
              name="primary_assignee_id"
              defaultValue={item?.primary_assignee_id ?? ''}
            >
              <option value="">— Chưa gán —</option>
              {props.people.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {/* 4. Kế hoạch ------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="4. Kế hoạch"
          description="Ngày ở đây là kế hoạch gốc. Ngày hiển thị của công việc cha được hệ thống tính riêng và không ghi đè giá trị này."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Loại lịch" htmlFor="schedule_type" required error={err('schedule_type')}>
            <Select
              id="schedule_type"
              name="schedule_type"
              value={scheduleType}
              onChange={(event) => setScheduleType(event.target.value as ScheduleType)}
            >
              {SCHEDULE_TYPES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {scheduleType === 'RECURRING' ? (
            <Field label="Chu kỳ" htmlFor="recurrence_rule" required error={err('recurrence_rule')}>
              <Select
                id="recurrence_rule"
                name="recurrence_rule"
                defaultValue={item?.recurrence_rule ?? 'MONTH'}
                required
              >
                {RECURRENCE_CYCLES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Ngày bắt đầu" htmlFor="planned_start" error={err('planned_start')}>
            <Input
              id="planned_start"
              name="planned_start"
              type="date"
              defaultValue={item?.planned_start ?? ''}
            />
          </Field>

          <Field
            label="Ngày kết thúc"
            htmlFor="planned_end"
            error={err('planned_end')}
            required={scheduleType === 'DEADLINE'}
          >
            <Input
              id="planned_end"
              name="planned_end"
              type="date"
              defaultValue={item?.planned_end ?? ''}
            />
          </Field>

          <Field label="Ngày rà soát" htmlFor="review_date">
            <Input id="review_date" name="review_date" type="date" defaultValue={item?.review_date ?? ''} />
          </Field>
        </CardBody>
      </Card>

      {/* 5. Nguồn lực ----------------------------------------------------- */}
      <Card>
        <CardHeader
          title="5. Nguồn lực"
          description="Thiếu một trong ba tham số dưới đây, hệ thống sẽ không kết luận mức tải của người thực hiện."
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Khối lượng ước tính (giờ)"
            htmlFor="estimated_hours_input"
            hint="Chỉ nhập ở điểm cuối; công việc cha tự cộng từ con."
            error={err('estimated_hours_input')}
          >
            <Input
              id="estimated_hours_input"
              name="estimated_hours_input"
              type="number"
              min={0}
              step={0.5}
              defaultValue={item?.estimated_hours_input ?? ''}
            />
          </Field>

          <Field label="Đơn vị phân bổ" htmlFor="allocation_unit">
            <Select id="allocation_unit" name="allocation_unit" defaultValue={item?.allocation_unit ?? ''}>
              <option value="">— Chưa xác định —</option>
              {ALLOCATION_UNITS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Phân bổ (giờ/kỳ)" htmlFor="allocation_hours" error={err('allocation_hours')}>
            <Input
              id="allocation_hours"
              name="allocation_hours"
              type="number"
              min={0}
              step={0.5}
              defaultValue={item?.allocation_hours ?? ''}
            />
          </Field>
        </CardBody>
      </Card>

      {/* 6. Thực hiện ----------------------------------------------------- */}
      <Card>
        <CardHeader
          title="6. Thực hiện"
          description="Tiến độ được cập nhật ở màn hình Việc của tôi hoặc trang chi tiết, không nhập tại form này."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Trạng thái" htmlFor="status" required error={err('status')}>
            <Select id="status" name="status" defaultValue={item?.status ?? 'NOT_SCHEDULED'} required>
              {WORK_STATUSES.filter((option) => option.code !== 'COMPLETED').map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Mức độ ưu tiên" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue={item?.priority ?? ''}>
              <option value="">— Chưa xác định —</option>
              {PRIORITIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Link kết quả" htmlFor="result_link" error={err('result_link')}>
            <Input
              id="result_link"
              name="result_link"
              type="url"
              placeholder="https://…"
              defaultValue={item?.result_link ?? ''}
            />
          </Field>
        </CardBody>
      </Card>

      {mode === 'edit' ? (
        <Card>
          <CardBody>
            <Field
              label="Lý do thay đổi"
              htmlFor="reason"
              hint="Bắt buộc khi đổi công việc cha. Được ghi vào audit log kèm giá trị trước/sau."
            >
              <Textarea id="reason" name="reason" rows={2} />
            </Field>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Đang lưu…">
          <Save aria-hidden className="size-4" />
          {mode === 'create' ? 'Tạo công việc' : 'Lưu thay đổi'}
        </SubmitButton>
        <Link
          href={item ? `/work-items/${item.id}` : '/work-items'}
          className="text-sm text-[var(--text-muted)] hover:underline"
        >
          Hủy
        </Link>
      </div>
    </form>
  );
}

function workLevelOptionLabel(level: number): string {
  if (level === 3) return 'Lớp 3 · Công việc chính';
  if (level === 4) return 'Lớp 4 · Danh mục';
  if (level === 5) return 'Lớp 5 · Nhiệm vụ';
  return `Lớp ${level} · Chi tiết phân rã`;
}
