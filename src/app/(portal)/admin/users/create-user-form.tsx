'use client';

import { useActionState, useState } from 'react';
import { UserPlus } from 'lucide-react';

import { Field, FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { ROLE_LABELS } from '@/domain/catalogs';
import type { RoleCode } from '@/domain/types';

import { createUserAction } from './actions';
import { EMPTY_USER_FORM_STATE, type UserFormState } from './form-state';

const STANDARD_ROLES: RoleCode[] = [
  'member',
  'unit_manager',
  'business_admin',
  'viewer',
  'auditor',
];

export function CreateUserForm({
  units,
  canManagePrivileged,
}: {
  units: { value: string; label: string }[];
  canManagePrivileged: boolean;
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(
    createUserAction,
    EMPTY_USER_FORM_STATE,
  );
  const [scopeType, setScopeType] = useState('SELF_ASSIGNED');
  const roles = canManagePrivileged
    ? (['system_admin', 'boc_director', ...STANDARD_ROLES] as RoleCode[])
    : STANDARD_ROLES;
  const err = (field: string) => state.fieldErrors?.[field] ?? null;

  return (
    <form action={formAction} className="space-y-4 p-5">
      <FormError message={state.error} />
      {state.success ? <Alert tone="info" title="Tạo tài khoản thành công">{state.success}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Họ và tên" htmlFor="full_name" required error={err('full_name')}>
          <Input id="full_name" name="full_name" required maxLength={128} />
        </Field>
        <Field label="Email đăng nhập" htmlFor="email" required error={err('email')}>
          <Input id="email" name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Mật khẩu ban đầu" htmlFor="password" required error={err('password')}>
          <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Mã nhân viên" htmlFor="employee_code" error={err('employee_code')}>
          <Input id="employee_code" name="employee_code" maxLength={50} />
        </Field>
        <Field label="Chức danh" htmlFor="job_title" error={err('job_title')}>
          <Input id="job_title" name="job_title" maxLength={150} />
        </Field>
        <Field label="Đơn vị chính" htmlFor="primary_unit_id">
          <Select id="primary_unit_id" name="primary_unit_id" defaultValue="">
            <option value="">— Chưa gán —</option>
            {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
          </Select>
        </Field>
        <Field label="Vai trò" htmlFor="role_code" required error={err('role_code')}>
          <Select id="role_code" name="role_code" defaultValue="member" required>
            {roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </Select>
        </Field>
        <Field label="Phạm vi dữ liệu" htmlFor="scope_type" required error={err('scope_type')}>
          <Select
            id="scope_type"
            name="scope_type"
            value={scopeType}
            onChange={(event) => setScopeType(event.target.value)}
          >
            <option value="SELF_ASSIGNED">Công việc liên quan trực tiếp</option>
            <option value="UNIT">Theo đơn vị</option>
            <option value="ALL">Toàn BOC</option>
          </Select>
        </Field>
        <Field
          label="Đơn vị thuộc phạm vi"
          htmlFor="scope_unit_id"
          required={scopeType === 'UNIT'}
          error={err('scope_unit_id')}
        >
          <Select id="scope_unit_id" name="scope_unit_id" disabled={scopeType !== 'UNIT'} required={scopeType === 'UNIT'}>
            <option value="">— Chọn đơn vị —</option>
            {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
          </Select>
        </Field>
        <Field label="Công suất (giờ/ngày)" htmlFor="capacity_hours_per_day" error={err('capacity_hours_per_day')}>
          <Input id="capacity_hours_per_day" name="capacity_hours_per_day" type="number" min={0.5} max={24} step={0.5} defaultValue={8} />
        </Field>
      </div>

      <SubmitButton pendingLabel="Đang tạo tài khoản…">
        <UserPlus aria-hidden className="size-4" />
        Tạo người dùng
      </SubmitButton>
    </form>
  );
}
