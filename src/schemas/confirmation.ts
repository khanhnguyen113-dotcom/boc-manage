import { z } from 'zod';

/**
 * Chuỗi xác nhận cho thao tác không thể hoàn tác (xóa công việc, xóa tài khoản).
 *
 * Chấp nhận cả có dấu lẫn không dấu, hoa lẫn thường: người dùng Việt gõ “XÓA” là phản xạ tự
 * nhiên, bắt gõ đúng “XOA” không tăng an toàn mà chỉ tạo thao tác thừa ngay lúc căng thẳng nhất.
 * Vì cùng một người dùng gặp ô này ở nhiều màn hình, quy tắc phải nằm ở **một chỗ** — trước đây
 * mỗi màn hình khai báo riêng nên “XÓA” được ở màn công việc lại bị từ chối ở màn tài khoản.
 */

/** Bỏ dấu tiếng Việt rồi viết hoa — `đ`/`Đ` không phải dấu phụ nên phải thay riêng. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toUpperCase();
}

export const DELETE_KEYWORD = 'XÓA';

export const deleteConfirmationSchema = z
  .string()
  .trim()
  .transform(normalize)
  .pipe(z.literal('XOA', { message: `Nhập ${DELETE_KEYWORD} để xác nhận` }));
