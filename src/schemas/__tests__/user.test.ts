import { describe, expect, it } from 'vitest';

import {
  changeOwnPasswordSchema,
  changeUserPasswordSchema,
  createUserSchema,
  deleteUserSchema,
  updateUserSchema,
} from '../user';

const account = {
  full_name: 'Nguyễn Văn A',
  email: 'USER@EXAMPLE.COM',
  employee_code: null,
  job_title: null,
  primary_unit_id: null,
  role_code: 'member' as const,
  scope_type: 'SELF_ASSIGNED' as const,
  scope_unit_id: null,
  capacity_hours_per_day: 8,
};

describe('user account schemas', () => {
  it('khởi tạo và parse độc lập schema tạo tài khoản', () => {
    const parsed = createUserSchema.parse({ ...account, password: 'mat-khau-123' });
    expect(parsed.email).toBe('user@example.com');
  });

  it('khởi tạo và parse độc lập schema cập nhật tài khoản ở runtime', () => {
    const parsed = updateUserSchema.parse({ ...account, user_id: 'user-1', status: 'ACTIVE' });
    expect(parsed.user_id).toBe('user-1');
  });

  it('bắt buộc đơn vị khi phạm vi là UNIT', () => {
    const result = updateUserSchema.safeParse({
      ...account,
      user_id: 'user-1',
      status: 'ACTIVE',
      scope_type: 'UNIT',
    });
    expect(result.success).toBe(false);
  });

  it('kiểm tra mật khẩu xác nhận', () => {
    const result = changeUserPasswordSchema.safeParse({
      user_id: 'user-1',
      password: 'mat-khau-123',
      password_confirm: 'khong-khop-123',
    });
    expect(result.success).toBe(false);
  });

  it('người dùng tự đổi mật khẩu phải nhập đúng xác nhận và mật khẩu mới khác mật khẩu cũ', () => {
    expect(
      changeOwnPasswordSchema.safeParse({
        current_password: 'mat-khau-cu',
        password: 'mat-khau-moi',
        password_confirm: 'mat-khau-moi',
      }).success,
    ).toBe(true);
    expect(
      changeOwnPasswordSchema.safeParse({
        current_password: 'mat-khau-cu',
        password: 'mat-khau-cu',
        password_confirm: 'mat-khau-cu',
      }).success,
    ).toBe(false);
  });
});

describe('deleteUserSchema', () => {
  // Cùng một quản trị viên gặp ô xác nhận ở cả màn công việc lẫn màn tài khoản; hai màn hình
  // nhận hai chuỗi khác nhau là cái bẫy, không phải lớp an toàn.
  it('chấp nhận cùng các dạng xác nhận như xóa công việc', () => {
    for (const confirmation of ['XOA', 'XÓA', 'xóa', '  XÓA  ']) {
      expect(deleteUserSchema.safeParse({ user_id: 'u1', confirmation }).success).toBe(true);
    }
  });

  it('từ chối chuỗi khác', () => {
    expect(deleteUserSchema.safeParse({ user_id: 'u1', confirmation: 'đồng ý' }).success).toBe(false);
  });
});
