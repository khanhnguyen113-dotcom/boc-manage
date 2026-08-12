/**
 * Kiểm tra cấu hình khi Next.js server khởi động.
 *
 * `register` hoàn tất trước khi server nhận request. Nhờ vậy deployment thiếu secret hoặc cấu
 * hình Appwrite sai sẽ fail-fast và không nhận traffic trong trạng thái lỗi một phần.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { env } = await import('./config/env');

    try {
      env();
    } catch (error) {
      // Next.js ghi lỗi register nhưng vẫn có thể giữ HTTP server chạy và trả 500. Thoát mã 1 để
      // Docker/Dokploy không coi một tiến trình cấu hình sai là deployment đang hoạt động.
      console.error(
        '[startup] Cấu hình production không hợp lệ:',
        error instanceof Error ? error.message : 'Lỗi không xác định',
      );
      process.exit(1);
    }
  }
}
