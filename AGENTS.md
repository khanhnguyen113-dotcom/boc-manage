<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:boc-project-rules -->

# BOC Control Tower — quy tắc dự án

Nguồn chuẩn nghiệp vụ: `BOC_WEBAPP_GUIDELINE_NEXTJS_APPWRITE.md` (do BOC cung cấp), cùng
`IMPLEMENTATION_PLAN.md`, `DECISIONS.md`, `TRACEABILITY.md`, `NEED_CONFIRMATION.md` trong repo.

## Ranh giới không được vi phạm

- `src/domain/**` là TypeScript thuần: không import `src/server/**`, không đọc `process.env`,
  không gọi `new Date()`. Ngày hiện tại đến từ tham số hoặc `server/clock.ts`.
- `src/components/**` không import `node-appwrite` và không import repository.
- Business rule chỉ nằm ở `src/domain/**`, kèm unit test. Không viết rule trong React component,
  trong repository hay trong server action.
- Mọi thao tác ghi `work_items` đi qua `src/server/services/work-items.ts`, theo chuỗi:
  authenticate → authorize → load → validate Zod → business rules → write → recalculate ancestors
  → audit + activity + outbox → invalidate cache.
- File `'use server'` **chỉ được export hàm async**. Hằng số/kiểu để ở `form-state.ts` bên cạnh.
- Không tin bất kỳ giá trị nào do browser gửi cho: `created_by`, `updated_by`, `version`,
  `root_id`, `path`, `depth`, `is_leaf`, `effective_*`, `display_*`, `data_quality_*`.

## Ba nguyên tắc số liệu

1. Chỉ điểm cuối (`is_leaf`) được nhập tiến độ; công việc cha luôn là giá trị cuộn lên.
2. Không kết luận trên dữ liệu thiếu: mẫu số 0 hiển thị `—`, không hiển thị `0%`; thiếu tham số
   tải thì trạng thái là `INSUFFICIENT_DATA`, không phải `NORMAL`.
3. Mọi KPI phải truy vết được: trả kèm `eligible_count`, `excluded_count`, lý do loại trừ và
   link drill-down tới danh sách bản ghi nguồn.

## Trước khi commit

```bash
npm run verify:all   # typecheck + lint + 200 unit test
npm run build
```

## Thay đổi thường gặp

| Muốn làm | Sửa ở đâu |
|---|---|
| Đổi ngưỡng tải, lịch làm việc, cách cuộn tiến độ | `/admin/settings` (runtime), **không** sửa code |
| Đổi màu thương hiệu | khối `:root` trong `src/app/globals.css` |
| Thêm bảng/cột | `src/server/db/schema.ts` rồi chạy `npm run bootstrap:appwrite` |
| Thêm business rule | `src/domain/` + test, rồi mới gọi từ service |

Quyết định nghiệp vụ chưa được BOC chốt nằm ở `NEED_CONFIRMATION.md` — **không tự suy đoán**,
dùng giá trị cấu hình tạm và ghi rõ.

<!-- END:boc-project-rules -->
