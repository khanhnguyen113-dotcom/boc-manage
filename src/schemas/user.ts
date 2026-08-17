import { z } from 'zod';

export const userRoleSchema = z.enum([
  'system_admin',
  'boc_director',
  'business_admin',
  'unit_manager',
  'member',
  'viewer',
  'auditor',
]);

export const createUserSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(128),
    email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128),
    employee_code: z.string().trim().max(50).nullable(),
    job_title: z.string().trim().max(150).nullable(),
    primary_unit_id: z.string().max(64).nullable(),
    role_code: userRoleSchema,
    scope_type: z.enum(['ALL', 'UNIT', 'SELF_ASSIGNED']),
    scope_unit_id: z.string().max(64).nullable(),
    capacity_hours_per_day: z.number().positive().max(24).nullable(),
  })
  .refine((value) => value.scope_type !== 'UNIT' || Boolean(value.scope_unit_id), {
    path: ['scope_unit_id'],
    message: 'Phạm vi đơn vị bắt buộc chọn đơn vị',
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .extend({
    user_id: z.string().min(1),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  });

export const changeUserPasswordSchema = z
  .object({
    user_id: z.string().min(1),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128),
    password_confirm: z.string().min(8),
  })
  .refine((value) => value.password === value.password_confirm, {
    path: ['password_confirm'],
    message: 'Mật khẩu xác nhận không khớp',
  });

export const deleteUserSchema = z.object({
  user_id: z.string().min(1),
  confirmation: z.literal('XOA', { message: 'Nhập XOA để xác nhận xóa vĩnh viễn' }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
