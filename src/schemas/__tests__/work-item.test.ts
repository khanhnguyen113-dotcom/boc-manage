import { describe, expect, it } from 'vitest';

import { deleteWorkItemSchema } from '../work-item';

const validInput = {
  id: 'work-item-1',
  expected_version: 1,
  reason: 'Không còn áp dụng',
};

describe('deleteWorkItemSchema', () => {
  it.each(['XOA', 'xoa', 'XÓA', 'xóa', '  XÓA  '])(
    'chấp nhận xác nhận thân thiện: %s',
    (confirmation) => {
      const result = deleteWorkItemSchema.safeParse({ ...validInput, confirmation });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.confirmation).toBe('XOA');
    },
  );

  it('từ chối nội dung xác nhận không đúng', () => {
    const result = deleteWorkItemSchema.safeParse({ ...validInput, confirmation: 'đồng ý' });
    expect(result.success).toBe(false);
  });
});
