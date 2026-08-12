import 'server-only';

import { env } from '@/config/env';
import type { BusinessDate } from '@/domain/types';

/**
 * “Hôm nay” theo nghiệp vụ — ADR-007.
 *
 * Domain **không** được gọi `new Date()`. Mọi hàm cần ngày hiện tại đều nhận `BusinessDate`
 * từ đây, và test inject được bằng `withBusinessDate()`.
 *
 * Sheet nguồn đang để timezone `America/Los_Angeles`; toàn hệ thống này quy về
 * `APP_TIMEZONE = Asia/Ho_Chi_Minh` (BR-DAT-007).
 */

export interface BusinessClock {
  today(): BusinessDate;
  nowIso(): string;
  timezone(): string;
}

let override: BusinessDate | null = null;

function formatInTimezone(date: Date, timeZone: string): BusinessDate {
  // `en-CA` cho ra đúng định dạng YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export const businessClock: BusinessClock = {
  today: () => override ?? formatInTimezone(new Date(), env().APP_TIMEZONE),
  nowIso: () => new Date().toISOString(),
  timezone: () => env().APP_TIMEZONE,
};

/** Chỉ dùng trong test/script đối soát. */
export function withBusinessDate<T>(date: BusinessDate, fn: () => T): T {
  const previous = override;
  override = date;
  try {
    return fn();
  } finally {
    override = previous;
  }
}

/** Chuyển `Date`/ISO string về ngày nghiệp vụ theo timezone ứng dụng. */
export function toBusinessDate(value: Date | string | null | undefined): BusinessDate | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatInTimezone(date, env().APP_TIMEZONE);
}

/**
 * Ngày nghiệp vụ → ISO datetime để lưu vào cột `datetime` của Appwrite.
 * Neo vào 00:00 giờ Việt Nam để không bị lùi/ tiến ngày khi đọc lại.
 */
export function businessDateToIso(date: BusinessDate | null | undefined): string | null {
  if (!date) return null;
  return `${date}T00:00:00.000+07:00`;
}
