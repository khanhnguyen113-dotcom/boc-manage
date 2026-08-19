/**
 * Trạng thái form dùng chung cho `useActionState`.
 *
 * Tách khỏi `actions.ts` vì file `'use server'` **chỉ được export hàm async** — export một hằng
 * số object ở đó làm hỏng toàn bộ server action trong module lúc chạy.
 */

export interface FormState {
  error: string | null;
  success?: string | null;
  fieldErrors?: Record<string, string>;
  details?: { code: string; message: string }[];
}

export const EMPTY_FORM_STATE: FormState = { error: null };
