'use client';

import { useActionState, useState } from 'react';
import { KeyRound, Save, Trash2 } from 'lucide-react';

import { Field, FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Alert, Card, CardHeader } from '@/components/ui/primitives';
import { ROLE_LABELS } from '@/domain/catalogs';
import type { Profile, RoleCode, ScopeType } from '@/domain/types';

import {
  changeUserPasswordAction,
  deleteUserAction,
  updateUserAction,
} from '../actions';
import { EMPTY_USER_FORM_STATE, type UserFormState } from '../form-state';

const ROLES: RoleCode[] = [
  'system_admin',
  'boc_director',
  'business_admin',
  'unit_manager',
  'member',
  'viewer',
  'auditor',
];

export function UserAccountForms({
  profile,
  role,
  scopeType: initialScopeType,
  scopeUnitId,
  units,
  isSelf,
}: {
  profile: Profile;
  role: RoleCode;
  scopeType: ScopeType;
  scopeUnitId: string | null;
  units: { value: string; label: string }[];
  isSelf: boolean;
}) {
  const [updateState, updateAction] = useActionState<UserFormState, FormData>(
    updateUserAction,
    EMPTY_USER_FORM_STATE,
  );
  const [passwordState, passwordAction] = useActionState<UserFormState, FormData>(
    changeUserPasswordAction,
    EMPTY_USER_FORM_STATE,
  );
  const [deleteState, deleteAction] = useActionState<UserFormState, FormData>(
    deleteUserAction,
    EMPTY_USER_FORM_STATE,
  );
  const [scopeType, setScopeType] = useState<ScopeType>(initialScopeType);
  const fieldError = (field: string) => updateState.fieldErrors?.[field] ?? null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Hồ sơ, quyền và trạng thái"
          description="Thay đổi được đồng bộ sang Appwrite Auth và có audit log trước/sau."
        />
        <form action={updateAction} className="space-y-4 p-5">
          <input type="hidden" name="user_id" value={profile.user_id} />
          <FormFeedback state={updateState} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Họ và tên" htmlFor="full_name" required error={fieldError('full_name')}>
              <Input id="full_name" name="full_name" defaultValue={profile.full_name} maxLength={128} required />
            </Field>
            <Field label="Email đăng nhập" htmlFor="email" required error={fieldError('email')}>
              <Input id="email" name="email" type="email" defaultValue={profile.email} required />
            </Field>
            <Field label="Mã nhân viên" htmlFor="employee_code" error={fieldError('employee_code')}>
              <Input id="employee_code" name="employee_code" defaultValue={profile.employee_code ?? ''} maxLength={50} />
            </Field>
            <Field label="Chức danh" htmlFor="job_title" error={fieldError('job_title')}>
              <Input id="job_title" name="job_title" defaultValue={profile.job_title ?? ''} maxLength={150} />
            </Field>
            <Field label="Đơn vị chính" htmlFor="primary_unit_id">
              <Select id="primary_unit_id" name="primary_unit_id" defaultValue={profile.primary_unit_id ?? ''}>
                <option value="">— Chưa gán —</option>
                {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </Select>
            </Field>
            <Field label="Công suất (giờ/ngày)" htmlFor="capacity_hours_per_day" error={fieldError('capacity_hours_per_day')}>
              <Input id="capacity_hours_per_day" name="capacity_hours_per_day" type="number" min={0.5} max={24} step={0.5} defaultValue={profile.capacity_hours_per_day ?? 8} />
            </Field>
            <Field label="Vai trò" htmlFor="role_code" required error={fieldError('role_code')}>
              <Select id="role_code" name="role_code" defaultValue={role} required>
                {ROLES.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
              </Select>
            </Field>
            <Field label="Phạm vi dữ liệu" htmlFor="scope_type" required error={fieldError('scope_type')}>
              <Select id="scope_type" name="scope_type" value={scopeType} onChange={(event) => setScopeType(event.target.value as ScopeType)} required>
                <option value="SELF_ASSIGNED">Công việc liên quan trực tiếp</option>
                <option value="UNIT">Theo đơn vị</option>
                <option value="ALL">Toàn BOC</option>
              </Select>
            </Field>
            <Field label="Đơn vị thuộc phạm vi" htmlFor="scope_unit_id" required={scopeType === 'UNIT'} error={fieldError('scope_unit_id')}>
              <Select id="scope_unit_id" name="scope_unit_id" defaultValue={scopeUnitId ?? ''} disabled={scopeType !== 'UNIT'} required={scopeType === 'UNIT'}>
                <option value="">— Chọn đơn vị —</option>
                {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </Select>
            </Field>
            <Field label="Trạng thái tài khoản" htmlFor="status" required error={fieldError('status')}>
              <Select id="status" name="status" defaultValue={profile.status} required>
                <option value="ACTIVE">Hoạt động</option>
                <option value="INACTIVE">Đã khóa</option>
                <option value="SUSPENDED">Tạm ngưng</option>
              </Select>
            </Field>
          </div>
          <SubmitButton pendingLabel="Đang cập nhật…"><Save aria-hidden className="size-4" />Lưu thay đổi</SubmitButton>
        </form>
      </Card>

      <Card>
        <CardHeader title="Đổi mật khẩu" description="Sau khi đổi, toàn bộ phiên đăng nhập hiện tại của tài khoản sẽ bị thu hồi." />
        <form action={passwordAction} className="space-y-4 p-5">
          <input type="hidden" name="user_id" value={profile.user_id} />
          <FormFeedback state={passwordState} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Mật khẩu mới" htmlFor="password" required error={passwordState.fieldErrors?.password}>
              <Input id="password" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
            </Field>
            <Field label="Nhập lại mật khẩu" htmlFor="password_confirm" required error={passwordState.fieldErrors?.password_confirm}>
              <Input id="password_confirm" name="password_confirm" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
            </Field>
          </div>
          <SubmitButton pendingLabel="Đang đổi mật khẩu…"><KeyRound aria-hidden className="size-4" />Đổi mật khẩu</SubmitButton>
        </form>
      </Card>

      <Card className="border-[var(--tone-danger-border)]">
        <CardHeader
          title="Xóa tài khoản vĩnh viễn"
          description="Chỉ xóa được tài khoản chưa từng được tham chiếu trong công việc, phân công, bình luận hoặc audit. Tài khoản có lịch sử phải chuyển sang Đã khóa."
        />
        <form action={deleteAction} className="space-y-4 p-5">
          <input type="hidden" name="user_id" value={profile.user_id} />
          <FormFeedback state={deleteState} />
          {isSelf ? (
            <Alert tone="warning" title="Không thể tự xóa tài khoản đang đăng nhập" />
          ) : (
            <>
              <Field label="Nhập XOA để xác nhận" htmlFor="confirmation" required error={deleteState.fieldErrors?.confirmation}>
                <Input id="confirmation" name="confirmation" autoComplete="off" placeholder="XOA" required />
              </Field>
              <SubmitButton variant="danger" pendingLabel="Đang xóa…"><Trash2 aria-hidden className="size-4" />Xóa vĩnh viễn</SubmitButton>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}

function FormFeedback({ state }: { state: UserFormState }) {
  return (
    <>
      <FormError message={state.error} />
      {state.success ? <Alert tone="info" title={state.success} /> : null}
    </>
  );
}
