import { Query, type TablesDB } from 'node-appwrite';

import { TABLES, type ColumnSpec, type TableSpec } from '../../src/server/db/schema';

/**
 * Cột `required` thêm vào bảng **đã có dữ liệu**.
 *
 * Appwrite không cho phép đặt `default` trên cột bắt buộc, nên bản ghi cũ nhận `null`. Khi update,
 * Appwrite kiểm tra lại **toàn bộ** row chứ không chỉ phần patch, nên mọi lần ghi sau đó đều trả
 * `Invalid document structure: Missing required attribute`. Đọc dữ liệu vẫn bình thường — lỗi chỉ
 * lộ ra khi có người bấm lưu, và lộ ra ở *mọi* bản ghi cũ cùng lúc.
 *
 * Đây là điểm mù không thể thấy bằng cách so sánh metadata: schema đúng, cột đúng, chỉ dữ liệu
 * thiếu. Vì vậy `bootstrap:appwrite` tự vá còn `verify:schema` phải báo.
 */

export interface RequiredGap {
  table: string;
  /** Cột bắt buộc đang có bản ghi mang giá trị null. */
  column: string;
  /** Số bản ghi thiếu giá trị. */
  count: number;
  /** Giá trị mặc định khai báo trong schema — `undefined` nghĩa là phải xử lý thủ công. */
  fallback: unknown;
}

function declaredDefault(spec: ColumnSpec): unknown {
  return 'default' in spec ? spec.default : undefined;
}

function requiredColumns(spec: TableSpec): [string, ColumnSpec][] {
  return Object.entries(spec.columns).filter(([, column]) => column.required === true);
}

/** Bảng rỗng thì không thể có bản ghi thiếu dữ liệu — bỏ qua để không tốn lượt gọi. */
async function rowCount(tablesDB: TablesDB, databaseId: string, tableId: string): Promise<number> {
  const page = await tablesDB.listRows({ databaseId, tableId, queries: [Query.limit(1)] });
  return page.total;
}

export async function findRequiredGaps(
  tablesDB: TablesDB,
  databaseId: string,
  onProgress?: (table: string) => void,
): Promise<RequiredGap[]> {
  const gaps: RequiredGap[] = [];

  for (const spec of Object.values(TABLES) as TableSpec[]) {
    const columns = requiredColumns(spec);
    if (columns.length === 0) continue;

    onProgress?.(spec.id);
    if ((await rowCount(tablesDB, databaseId, spec.id)) === 0) continue;

    for (const [key, column] of columns) {
      const page = await tablesDB.listRows({
        databaseId,
        tableId: spec.id,
        queries: [Query.isNull(key), Query.limit(1)],
      });
      if (page.total > 0) {
        gaps.push({
          table: spec.id,
          column: key,
          count: page.total,
          fallback: declaredDefault(column),
        });
      }
    }
  }

  return gaps;
}

const PAGE_SIZE = 100;

/**
 * Điền giá trị mặc định cho các bản ghi cũ.
 *
 * Vá **theo từng bản ghi** và chỉ đụng đúng những cột đang null: ghi đè hàng loạt sẽ xóa mất giá
 * trị thật của bản ghi đã có dữ liệu (ví dụ đưa `completion_approval_status` đang là `SUBMITTED`
 * về `NONE`). Mỗi bản ghi phải được điền **đủ** mọi cột bắt buộc đang thiếu trong cùng một lần
 * ghi, vì Appwrite kiểm tra toàn bộ row.
 */
export async function backfillRequiredGaps(
  tablesDB: TablesDB,
  databaseId: string,
  gaps: readonly RequiredGap[],
  log: (message: string) => void = () => {},
): Promise<{ patched: number; manual: RequiredGap[] }> {
  const manual = gaps.filter((gap) => gap.fallback === undefined);
  const fixable = gaps.filter((gap) => gap.fallback !== undefined);
  if (fixable.length === 0) return { patched: 0, manual };

  const byTable = new Map<string, RequiredGap[]>();
  for (const gap of fixable) {
    byTable.set(gap.table, [...(byTable.get(gap.table) ?? []), gap]);
  }

  let patched = 0;

  for (const [tableId, tableGaps] of byTable) {
    const keys = tableGaps.map((gap) => gap.column);
    const fallbacks = new Map(tableGaps.map((gap) => [gap.column, gap.fallback]));
    const seen = new Set<string>();

    // Mỗi cột quét riêng: một bản ghi có thể thiếu ở cột này mà đủ ở cột kia.
    for (const key of keys) {
      for (;;) {
        const page = await tablesDB.listRows({
          databaseId,
          tableId,
          queries: [Query.isNull(key), Query.limit(PAGE_SIZE)],
        });
        const rows = (page.rows as unknown as Record<string, unknown>[]).filter(
          (row) => !seen.has(String(row.$id)),
        );
        if (rows.length === 0) break;

        for (const row of rows) {
          // Đánh dấu trước khi ghi: nếu không, một bản ghi không cần vá sẽ quay lại ở vòng sau
          // và vòng lặp không bao giờ dừng.
          seen.add(String(row.$id));

          const data: Record<string, unknown> = {};
          for (const column of keys) {
            if (row[column] === null || row[column] === undefined) {
              data[column] = fallbacks.get(column);
            }
          }
          if (Object.keys(data).length === 0) continue;

          await tablesDB.updateRow({ databaseId, tableId, rowId: String(row.$id), data });
          patched += 1;
        }

        log(`  … ${tableId}: đã điền ${patched} bản ghi`);
        if (page.total <= rows.length) break;
      }
    }
  }

  return { patched, manual };
}
