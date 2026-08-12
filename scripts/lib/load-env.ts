/**
 * Nạp biến môi trường cho script CLI.
 *
 * Next.js tự đọc `.env.local` rồi `.env`, nhưng script Node thuần thì không — nếu chỉ
 * `import 'dotenv/config'` thì script sẽ bỏ qua `.env.local` và chạy sai môi trường so với app.
 * File này giữ đúng thứ tự ưu tiên của Next.js: `.env.local` thắng `.env`.
 *
 * Import ở **dòng đầu tiên** của mỗi script, trước mọi module đọc `process.env`.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// dotenv không ghi đè biến đã tồn tại, nên file đứng trước trong danh sách có độ ưu tiên cao hơn.
const files = ['.env.local', '.env'].map((name) => resolve(ROOT, name)).filter(existsSync);

if (files.length > 0) {
  config({ path: files, quiet: true });
}

export const loadedEnvFiles = files;
