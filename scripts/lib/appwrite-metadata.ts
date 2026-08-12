import { Query, type TablesDB } from 'node-appwrite';

/**
 * Đọc **toàn bộ** column/index của một bảng.
 *
 * Appwrite phân trang mặc định 25 mục cho cả `listColumns` và `listIndexes`. Bảng `work_items`
 * có 43 cột, nên nếu chỉ gọi một lần thì 18 cột cuối “biến mất” — bootstrap sẽ chờ chúng sẵn sàng
 * vô hạn và verify-schema sẽ báo thiếu cột không tồn tại. Mọi nơi đọc metadata phải đi qua đây.
 */

const PAGE_SIZE = 100;

export interface ColumnInfo {
  key: string;
  status?: string;
  required?: boolean;
  error?: string;
}

export interface IndexInfo {
  key: string;
  status?: string;
  type?: string;
}

export async function listAllColumns(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
): Promise<ColumnInfo[]> {
  const out: ColumnInfo[] = [];
  let offset = 0;

  for (;;) {
    const page = await tablesDB.listColumns({
      databaseId,
      tableId,
      queries: [Query.limit(PAGE_SIZE), Query.offset(offset)],
    });
    out.push(...(page.columns as unknown as ColumnInfo[]));
    offset += PAGE_SIZE;
    if (out.length >= page.total || page.columns.length === 0) return out;
  }
}

export async function listAllIndexes(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
): Promise<IndexInfo[]> {
  const out: IndexInfo[] = [];
  let offset = 0;

  for (;;) {
    const page = await tablesDB.listIndexes({
      databaseId,
      tableId,
      queries: [Query.limit(PAGE_SIZE), Query.offset(offset)],
    });
    out.push(...(page.indexes as unknown as IndexInfo[]));
    offset += PAGE_SIZE;
    if (out.length >= page.total || page.indexes.length === 0) return out;
  }
}
