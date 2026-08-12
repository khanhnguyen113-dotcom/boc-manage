import { cp, mkdir } from 'node:fs/promises';

/**
 * Next.js standalone không tự chép public và .next/static. Dockerfile xử lý bằng COPY; Nixpacks
 * cần đóng gói hai thư mục này vào artifact trước khi tạo runtime image.
 */
await mkdir('.next/standalone/.next', { recursive: true });
await Promise.all([
  cp('public', '.next/standalone/public', { recursive: true, force: true }),
  cp('.next/static', '.next/standalone/.next/static', { recursive: true, force: true }),
]);

console.log('Đã chuẩn bị Next.js standalone artifact cho Nixpacks.');
