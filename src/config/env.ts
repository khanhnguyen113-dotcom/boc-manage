import 'server-only';

import { z } from 'zod';

/**
 * Cấu hình runtime — nơi DUY NHẤT đọc `process.env`.
 *
 * Guideline mục 0.11 và 17: API key chỉ tồn tại phía server, không bao giờ lọt vào
 * `NEXT_PUBLIC_*`, bundle client hay log. `import 'server-only'` khiến build **thất bại**
 * nếu có component client vô tình import file này.
 */

const booleanish = z
  .union([z.literal('1'), z.literal('0'), z.literal('true'), z.literal('false')])
  .transform((v) => v === '1' || v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_NAME: z.string().default('BOC Control Tower'),
  APP_URL: z.string().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
  APP_LOCALE: z.string().default('vi-VN'),

  /** `local` chỉ dùng cho development — xem ADR-003. */
  DATA_DRIVER: z.enum(['local', 'appwrite']).default('local'),
  LOCAL_DATA_FILE: z.string().default('.data/boc.json'),

  SESSION_COOKIE_NAME: z.string().default('hh_boc_session'),
  SESSION_SECRET: z.string().min(16).default('doi-gia-tri-nay-truoc-khi-len-staging'),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 8),

  APPWRITE_ENDPOINT: z.string().optional(),
  APPWRITE_PROJECT_ID: z.string().optional(),
  APPWRITE_DATABASE_ID: z.string().default('boc_control_tower'),
  APPWRITE_SERVER_API_KEY: z.string().optional(),
  APPWRITE_API_KEY_AUTH: z.string().optional(),
  APPWRITE_API_KEY_DATA: z.string().optional(),
  APPWRITE_BUCKET_ATTACHMENTS: z.string().default('boc_attachments'),
  APPWRITE_BUCKET_EXPORTS: z.string().default('boc_exports'),
  APPWRITE_BUCKET_IMPORTS: z.string().default('boc_imports'),

  // --- tham số nghiệp vụ, tất cả đều là NEED_CONFIRMATION, không hard-code ở nơi khác ---
  WORK_WEEK_MASK: z.enum(['MON_SAT', 'MON_FRI']).default('MON_SAT'),
  CAPACITY_DAYS_PER_WEEK: z.coerce.number().min(1).max(7).default(5),
  DEFAULT_CAPACITY_HOURS_PER_DAY: z.coerce.number().positive().default(8),
  NEAR_CAPACITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  DEADLINE_WARNING_BUSINESS_DAYS: z.coerce.number().int().positive().default(7),
  PROGRESS_ROLLUP_MODE: z.enum(['average', 'weighted']).default('average'),
  EXECUTION_LOG_EDIT_WINDOW_HOURS: z.coerce.number().int().positive().default(72),

  /** Mật khẩu dùng chung cho tài khoản demo khi `DATA_DRIVER=local`. */
  LOCAL_DEV_PASSWORD: z.string().default('boc@2026'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DEBUG_SQL: booleanish.default(false),
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;

  // Hỗ trợ cả một server key dùng chung và hai key tách quyền trên Dokploy.
  // Key tách quyền luôn được ưu tiên để thao tác Auth không vô tình dùng data-only key.
  const sharedAppwriteKey =
    process.env.APPWRITE_SERVER_API_KEY?.trim() ||
    process.env.APPWRITE_API_KEY?.trim() ||
    undefined;
  const runtimeEnv = {
    ...process.env,
    APPWRITE_SERVER_API_KEY: sharedAppwriteKey,
    APPWRITE_API_KEY_AUTH: process.env.APPWRITE_API_KEY_AUTH?.trim() || sharedAppwriteKey,
    APPWRITE_API_KEY_DATA: process.env.APPWRITE_API_KEY_DATA?.trim() || sharedAppwriteKey,
  };

  const parsed = schema.safeParse(runtimeEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}`);
  }

  const value = parsed.data;

  // ADR-003: chặn cứng driver local ở production.
  if (value.NODE_ENV === 'production' && value.DATA_DRIVER === 'local') {
    throw new Error(
      'DATA_DRIVER=local không được phép ở production. Đặt DATA_DRIVER=appwrite và cấu hình Appwrite.',
    );
  }

  if (value.DATA_DRIVER === 'appwrite') {
    const missing = (
      ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY_AUTH', 'APPWRITE_API_KEY_DATA'] as const
    ).filter((key) => !value[key]);
    if (missing.length > 0) {
      throw new Error(`DATA_DRIVER=appwrite nhưng thiếu: ${missing.join(', ')}.`);
    }
  }

  if (value.NODE_ENV === 'production' && value.SESSION_SECRET.startsWith('doi-gia-tri-nay')) {
    throw new Error('SESSION_SECRET vẫn là giá trị mặc định — bắt buộc đổi trước khi lên production.');
  }

  cached = value;
  return value;
}

/** Giá trị an toàn để hiển thị ở trang trạng thái/health — không chứa secret. */
export function publicRuntimeInfo() {
  const e = env();
  return {
    app_name: e.APP_NAME,
    environment: e.NODE_ENV,
    data_driver: e.DATA_DRIVER,
    timezone: e.APP_TIMEZONE,
    work_week_mask: e.WORK_WEEK_MASK,
    capacity_days_per_week: e.CAPACITY_DAYS_PER_WEEK,
    default_capacity_hours_per_day: e.DEFAULT_CAPACITY_HOURS_PER_DAY,
    near_capacity_threshold: e.NEAR_CAPACITY_THRESHOLD,
    deadline_warning_business_days: e.DEADLINE_WARNING_BUSINESS_DAYS,
    progress_rollup_mode: e.PROGRESS_ROLLUP_MODE,
  };
}
