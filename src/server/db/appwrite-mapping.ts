import { TABLES, type TableName } from './schema';

/**
 * Ánh xạ giữa **biểu diễn lưu trữ của Appwrite** và **biểu diễn của domain**.
 *
 * Tách khỏi driver để test được: hai lỗi thật đã gặp khi đưa dữ liệu lên Appwrite đều nằm ở đây
 * và đều **hỏng âm thầm** chứ không ném lỗi rõ ràng:
 *
 * 1. Appwrite chuẩn hóa cột `datetime` thành ISO đầy đủ. Domain dùng ngày nghiệp vụ `YYYY-MM-DD`,
 *    nên `isOverdue` luôn trả false, “còn N ngày” luôn `null`, lịch trống — trong khi dữ liệu vẫn
 *    hiển thị bình thường ở các cột khác.
 * 2. `created_at`/`updated_at`/`id` của domain là metadata hệ thống (`$createdAt`…), truy vấn theo
 *    tên domain bị Appwrite từ chối.
 */

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Cột ngày nghiệp vụ của từng bảng, suy trực tiếp từ khai báo schema. */
export const BUSINESS_DATE_COLUMNS: Record<TableName, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(TABLES).map(([table, spec]) => [
    table,
    new Set(
      Object.entries(spec.columns)
        .filter(([, column]) => column.kind === 'datetime' && column.businessDate === true)
        .map(([key]) => key),
    ),
  ]),
) as unknown as Record<TableName, ReadonlySet<string>>;

/** Trường của domain trùng tên với metadata hệ thống của Appwrite. */
const SYSTEM_FIELD_ALIASES: Record<string, string> = {
  id: '$id',
  created_at: '$createdAt',
  updated_at: '$updatedAt',
};

export function toStorageField(field: string): string {
  return SYSTEM_FIELD_ALIASES[field] ?? field;
}

export function isBusinessDateColumn(table: TableName, field: string): boolean {
  return BUSINESS_DATE_COLUMNS[table]?.has(field) ?? false;
}

/** ISO bất kỳ → ngày nghiệp vụ `YYYY-MM-DD` theo múi giờ ứng dụng. */
export function isoToBusinessDate(value: string, timeZone: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Ngày nghiệp vụ → ISO neo vào 00:00 của múi giờ ứng dụng.
 * Neo sai múi giờ sẽ làm ngày bị lùi/tiến một ngày khi đọc lại.
 */
export function businessDateToStorage(value: string, offset: string): string {
  return `${value}T00:00:00.000${offset}`;
}

/** Giá trị đọc từ Appwrite → giá trị domain. */
export function mapRowFromStorage(
  table: TableName,
  row: Record<string, unknown>,
  timeZone: string,
): Record<string, unknown> {
  const columns = BUSINESS_DATE_COLUMNS[table];
  if (!columns || columns.size === 0) return row;

  const out = { ...row };
  for (const key of columns) {
    const value = out[key];
    if (typeof value === 'string' && value) {
      out[key] = isoToBusinessDate(value, timeZone) ?? value;
    }
  }
  return out;
}

/** Giá trị domain → giá trị ghi lên Appwrite. */
export function mapRowToStorage(
  table: TableName,
  row: Record<string, unknown>,
  offset: string,
): Record<string, unknown> {
  const columns = BUSINESS_DATE_COLUMNS[table];
  if (!columns || columns.size === 0) return row;

  const out = { ...row };
  for (const key of columns) {
    const value = out[key];
    if (typeof value === 'string' && BUSINESS_DATE_RE.test(value)) {
      out[key] = businessDateToStorage(value, offset);
    }
  }
  return out;
}

/** Giá trị dùng trong `Query.*` — ngày phải gửi lên dạng ISO để so sánh đúng kiểu. */
export function mapFilterValue(
  table: TableName,
  field: string,
  value: unknown,
  offset: string,
): unknown {
  if (!isBusinessDateColumn(table, field)) return value;
  if (typeof value !== 'string' || !BUSINESS_DATE_RE.test(value)) return value;
  return businessDateToStorage(value, offset);
}
