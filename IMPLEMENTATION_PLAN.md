# IMPLEMENTATION_PLAN — BOC Control Tower

Ứng dụng: **BOC Control Tower** — không gian làm việc chung của Trung tâm Điều hành BOC,
Công ty Cổ phần Văn phòng phẩm Hồng Hà.

Stack theo guideline mục 14: Next.js 16 App Router + TypeScript strict · Tailwind CSS 4 ·
Zod + React Hook Form · Appwrite Auth/TablesDB/Storage · Recharts · ExcelJS · Vitest · Docker/Dokploy.

---

## 1. Bản đồ thư mục

```text
src/
├── app/
│   ├── (auth)/login/                 đăng nhập (server action)
│   ├── (portal)/                     shell có sidebar + topbar
│   │   ├── dashboard/                Control Tower
│   │   ├── my-work/                  Việc của tôi + quick update
│   │   ├── work-map/                 cây L3–L6
│   │   ├── work-items/               bảng · [id] chi tiết · new/edit
│   │   ├── calendar/                 lịch & deadline
│   │   ├── workload/                 tải nguồn lực
│   │   ├── reports/                  daily/weekly/monthly/yearly/data-health
│   │   ├── notifications/
│   │   ├── profile/
│   │   └── admin/                    users, organization, catalogs, holidays, settings, audit, imports
│   └── api/                          health, ready, exports
├── components/  ui/ · layout/ · data-table/ · work-tree/ · charts/ · forms/
├── domain/      thuần TS, không I/O — nơi duy nhất chứa business rules
├── server/      appwrite/ · auth/ · repositories/ · services/ · policies/ · audit/
├── schemas/     Zod cho mọi input
├── config/      env, catalog labels, capacity, files
└── tests/       fixtures dùng chung
scripts/         bootstrap-appwrite · seed · import-google-sheet · verify-schema
data/seed/       dữ liệu trích từ Google Sheet nguồn
```

Ranh giới bắt buộc (guideline 14.5):

- `components/**` **không** import `node-appwrite`, không import `server/repositories/**`.
- `domain/**` **không** import `server/**`, không đọc `process.env`, không gọi `new Date()`.
- `server/repositories/**` chỉ CRUD; mọi rule ở `domain/**`; mọi kiểm quyền ở `server/policies/**`.

## 2. Chuỗi xử lý mutation (guideline mục 0.9)

Mọi server action đi qua `withMutation()` trong `src/server/services/mutation.ts`:

```text
authenticate → authorize (role+capability+scope) → load current resource
→ validate Zod → enforce business rules (domain) → write
→ recalculate ancestors → append audit + activity + outbox
→ invalidate cache (revalidatePath) → return safe DTO
```

Không có đường ghi nào đi vòng qua hàm này.

## 3. Phase

| Phase | Nội dung | Trạng thái |
|---|---|---|
| **P0** | Đọc guideline, trích dữ liệu Sheet, lập PLAN/DECISIONS/TRACEABILITY/NEED_CONFIRMATION | ✅ |
| **P1** | Foundation: scaffold, config/env, design system, app shell, health/ready, Docker | ✅ |
| **P2** | Authorization & audit: role/capability/scope, session cookie, audit append-only, outbox | ✅ |
| **P3** | Work Core: schema, cây L3–L6, bảng/chi tiết/form, assignments, transitions, comments | ✅ |
| **P4** | Rules & Daily Work: roll-up tiến độ/ngày/giờ, data quality, My Work, execution logs, notifications | ✅ |
| **P5** | Control Tower & Reports: dashboard, workload, calendar, report service, export XLSX/CSV | ✅ |
| **P6** | Migration & UAT: import Sheet dry-run, reconciliation, đào tạo | 🔶 script + dry-run sẵn sàng; **chờ dữ liệu đã chốt và biên bản đối soát** |
| **P7** | Production: Appwrite bootstrap thật, backup/restore drill, monitoring, cutover | 🔶 script + Dockerfile + runbook sẵn sàng; **chờ hạ tầng VPS/Appwrite của BOC** |

🔶 = code đã có, còn phụ thuộc quyết định/hạ tầng phía BOC (xem `NEED_CONFIRMATION.md`).

## 4. Domain modules và rule tương ứng

| Module | File | Rule guideline |
|---|---|---|
| Danh mục & nhãn tiếng Việt | `domain/catalogs.ts` | 3.3–3.5, 7.6 |
| Ngày làm việc / holiday / timezone | `domain/business-days.ts` | 8.5, 8.6 |
| Quan hệ cây, cycle, leaf | `domain/hierarchy.ts` | BR-HIE-001…006 |
| Roll-up tiến độ | `domain/progress.ts` | BR-PRO-001…006 |
| Ngày kế hoạch vs hiển thị | `domain/dates.ts` | BR-DAT-001…007 |
| Trạng thái & evidence hoàn thành | `domain/status.ts` | BR-STA-001…008 |
| Giờ, phân bổ, tải, công suất | `domain/workload.ts` | BR-LOD-001…006 |
| Định kỳ / phát sinh | `domain/execution.ts` | BR-REC-001…005 |
| Chất lượng dữ liệu | `domain/data-quality.ts` | 8.9 |
| Chỉ số dashboard & báo cáo | `domain/metrics.ts` | 10, 11 |
| Quyền hiệu lực | `domain/permissions.ts` | 4.1–4.5 |

Mỗi module có test tại `src/domain/__tests__/<module>.test.ts`, chạy `npm test`.

## 5. Cách chạy

```bash
npm install
cp .env.example .env.local     # DATA_DRIVER=local để chạy ngay, không cần Appwrite
npm run seed                   # nạp dữ liệu từ data/seed vào .data/boc.json
npm run dev
```

Tài khoản demo (driver `local`): xem `README.md`.

Chạy production với Appwrite:

```bash
DATA_DRIVER=appwrite npm run bootstrap:appwrite   # tạo database/tables/indexes/buckets (idempotent)
DATA_DRIVER=appwrite npm run seed                 # seed danh mục + dữ liệu đã duyệt
npm run build && npm start
```

## 6. Điều KHÔNG làm ở MVP (giữ đúng mục 2.3)

Không ERP/kế toán/kho; không chat realtime; không mobile native; không payroll/chấm công; không
tự động xếp loại nhân sự; không public portal; không multi-tenant; **không** đồng bộ hai chiều với
Google Sheet sau cutover.

## 7. Việc còn lại trước khi go-live

1. Đóng toàn bộ mục 🔴 trong `NEED_CONFIRMATION.md` (đặc biệt B1–B4, B7, C1, C4, D3, D4).
2. Dựng Appwrite instance của BOC, chạy `bootstrap:appwrite` trên staging và đối soát manifest.
3. Chạy `import:dry-run` với bản Sheet đã freeze → biên bản reconciliation có chữ ký.
4. E2E theo mục 22.3 (Playwright chưa nằm trong MVP hiện tại — xem mục 8 bên dưới).
5. Backup/restore drill + monitoring theo mục 19–20.

## 8. Khoảng trống đã biết (khai báo minh bạch)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Playwright E2E (mục 22.3) | **Chưa có** | Unit test domain đã phủ toàn bộ business rule; E2E cần môi trường staging thật |
| Appwrite Storage upload file đính kèm | **Một phần** | Model `attachments` + `result_link` đã có; upload binary cần bucket thật |
| Xuất PDF báo cáo điều hành | **Chưa có** | XLSX/CSV đã có; PDF chờ chốt mẫu báo cáo (E-mục 19 guideline) |
| Email/digest | **Ngoài MVP** | Theo mục 2.2 Phase 2 |
| Gantt / dependency nâng cao | **Ngoài MVP** | Bảng `work_dependencies` đã có schema, UI ở Phase 2 |
