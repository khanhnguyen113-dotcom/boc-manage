# DECISIONS — Architecture Decision Records

Định dạng ngắn: **Bối cảnh → Quyết định → Hệ quả**.
Các quyết định nghiệp vụ **chưa được BOC phê duyệt** nằm ở `NEED_CONFIRMATION.md`; ADR ở đây là
quyết định **kỹ thuật** do đội phát triển chịu trách nhiệm, hoặc quyết định nghiệp vụ **đã có
người duyệt** (ghi rõ tên + ngày).

---

## ADR-001 — Một bảng `work_items` duy nhất cho L3–L6

**Bối cảnh.** Sheet nguồn có 4 tab riêng (Lớp 3/4/5/6) cộng thêm “Lớp tổng hợp”. Mỗi tab lặp lại
cột của tab cha, dẫn tới `#REF!`, lệch số và không thể phân quyền theo record.

**Quyết định.** Dùng **một** bảng `work_items` với `level ∈ {3,4,5,6}`, `parent_id`, `root_id`,
`path`, `depth`. Các tab Sheet trở thành **view** có filter `level = n`.

**Hệ quả.** Query cây bằng `root_id`/`path`; ràng buộc cấp cha kiểm ở domain (`BR-HIE-001..002`).
Không có bảng nào là “bản sao đã tổng hợp” — mọi tổng hợp là derived.

---

## ADR-002 — Derived values được tính ở server, cache vào cột `*_effective`

**Bối cảnh.** `effective_progress`, `display_start/end`, `effective_estimated_hours`, `is_leaf`,
`data_quality_status` đều là hàm của cây con. Tính lại mỗi request là O(cây) và không index được.

**Quyết định.** Ghi cache vào chính row, **chỉ do server ghi**, mỗi lần mutation chạy
`recalculateAncestors()` trong cùng transaction (Appwrite) hoặc cùng lần ghi (local driver).
Browser gửi lên các giá trị này thì **bỏ qua**.

**Hệ quả.** Cần script `verify-derived` để đối soát cache vs tính lại (dùng trong CI + sau import).

---

## ADR-003 — Hai driver dữ liệu sau một interface repository

**Bối cảnh.** Guideline yêu cầu Appwrite TablesDB là store production và **cấm** backend Node
riêng. Nhưng cần chạy/demo/nghiệm thu UI và chạy test khi chưa có Appwrite instance.

**Quyết định.** `DATA_DRIVER = appwrite | local`.

- `appwrite` — `node-appwrite` TablesDB, **duy nhất được dùng cho staging/production**.
- `local` — store JSON append-safe tại `.data/boc.json`, seed từ `data/seed/*.json`. Chỉ cho
  `development`. Server **từ chối khởi động** nếu `NODE_ENV=production` và `DATA_DRIVER=local`.

Cả hai nằm sau cùng interface trong `src/server/repositories/`. Domain/service **không biết**
driver nào đang chạy.

**Hệ quả.** Đây **không** phải backend thứ hai: không có API riêng, không có source of truth song
song, chỉ là adapter thay thế trong dev. Rủi ro “chạy nhầm local ở production” được chặn bằng
guard runtime + `/api/ready` báo driver đang dùng.

---

## ADR-004 — Authorization ở server, deny-by-default

**Bối cảnh.** Sheet không phân quyền được; guideline yêu cầu chống IDOR ở mọi route.

**Quyết định.** Mọi query/mutation đi qua `assertCan(actor, capability, resource?)`.
`effective_permission = role_baseline + user_capabilities + scope + assignment − denials`.
UI chỉ **ẩn** nút; không bao giờ là lớp bảo vệ. Không cache quyền ở browser.

**Hệ quả.** Mọi hàm đọc danh sách nhận `EffectiveScope` và tự lọc; test IDOR bắt buộc.

---

## ADR-005 — Không hard delete dữ liệu nghiệp vụ

**Quyết định.** `is_archived` / `status = CANCELLED` + `cancel_reason`. Comment bị ẩn
(`is_hidden`) chứ không xóa. `audit_logs` append-only, không có API sửa/xóa.

---

## ADR-006 — Optimistic concurrency bằng `version`

**Quyết định.** Mọi mutation gửi `expected_version`; lệch ⇒ `409 CONFLICT` kèm bản hiện tại.
Không auto-merge.

---

## ADR-007 — Business clock injectable

**Bối cảnh.** Deadline/quá hạn/“7 ngày tới” phụ thuộc “hôm nay”, mà test cần xác định.

**Quyết định.** `businessClock.today()` trả `YYYY-MM-DD` theo `APP_TIMEZONE`
(`Asia/Ho_Chi_Minh`), inject được trong test. **Cấm** `new Date()` trực tiếp trong domain.

**Hệ quả.** Lịch nghiệp vụ (`WORK_WEEK_MASK` + `holidays`) là input tường minh của mọi hàm
business-day, không đọc global.

---

## ADR-008 — Giữ average đều (không weighted) cho MVP

**Bối cảnh.** Sheet dùng `AVERAGE` các con hợp lệ. Weighted theo giờ “đúng” hơn về quản trị nhưng
làm số liệu lệch so với Sheet ⇒ không đối soát được khi import.

**Quyết định.** MVP dùng average đều. Chế độ weighted đã cài sẵn sau cờ
`PROGRESS_ROLLUP_MODE=average|weighted`, **mặc định `average`**, chỉ bật khi PO duyệt (xem B1).

---

## ADR-009 — Loại trừ khỏi progress average

**Bối cảnh.** Sheet: *“Công việc khác”, “Chưa lên lịch” và “Đã lên lịch” không tính vào tiến độ
trung bình*.

**Quyết định.** Giữ nguyên: loại `category = OTHER`, `status ∈ {NOT_SCHEDULED, SCHEDULED,
CANCELLED}` khỏi mẫu số. Mỗi KPI trả kèm `eligible_count`, `excluded_count`, `exclusion_reasons`
để giải thích được vì sao số khác kỳ vọng.

---

## ADR-010 — Không dùng Appwrite row-permission thay cho domain authz

**Quyết định.** Table nghiệp vụ **không** cấp quyền cho `role:all`/client. Browser không CRUD
trực tiếp. Row-level permission chỉ dùng như lớp phòng vệ thứ hai cho file/record nhạy cảm.

---

## ADR-011 — Không dùng TanStack Table / shadcn CLI ở MVP

**Bối cảnh.** Guideline gợi ý TanStack Table + shadcn/ui. Bảng của hệ thống này **phân trang,
lọc, sort ở server** nên phần lớn tính năng client-side của TanStack không dùng tới.

**Quyết định.** Viết `components/ui/*` theo đúng phong cách/primitive của shadcn (Radix-less,
Tailwind + `cva`) và `components/data-table` đọc trạng thái từ URL search params.

**Hệ quả.** Ít dependency, bundle nhỏ hơn, nhưng phải tự viết a11y cho dialog/tabs — đã làm bằng
`<dialog>` gốc và ARIA roles.

---

## ADR-012 — Export XLSX chống formula injection

**Quyết định.** Mọi ô chuỗi bắt đầu bằng `=`, `+`, `-`, `@`, TAB, CR sẽ được prefix `'`.
Áp dụng ở **một hàm duy nhất** `sanitizeCell()` dùng chung cho XLSX và CSV.

---

## ADR-013 — Màu thương hiệu là token, không phải hằng số rải rác

**Bối cảnh.** Chưa có mã màu Hồng Hà chính thức (E1).

**Quyết định.** Toàn bộ màu qua CSS variable trong `globals.css` (`--brand-600`, `--status-*`,
`--priority-*`). Đổi brand = sửa 1 khối `:root`. Giá trị hiện tại là **placeholder**, đã ghi rõ
comment trong file.

---

## ADR-014 — Trạng thái danh sách nằm trên URL

**Quyết định.** Filter/sort/page là search params (`?level=5&status=IN_PROGRESS&page=2`). Lý do:
share được link, drill-down từ KPI chỉ là một URL, back/forward hoạt động đúng, và server component
đọc trực tiếp không cần state client.

---

## ADR-015 — Pin phiên bản

**Quyết định.** `next@16.3.0`, `react@19.2.8`, `node-appwrite@^27.1.0`, `tailwindcss@^4`.
`npm ci` bằng lockfile trong Docker. Không dùng tag `latest` cho image Appwrite.

---

## ADR-016 — Driver Appwrite tự dịch biểu diễn ngày và tên trường hệ thống

**Bối cảnh.** Khi đưa dữ liệu thật lên Appwrite, hai lỗi xuất hiện và **cả hai đều hỏng âm thầm**
— không có exception, giao diện vẫn hiển thị bình thường, chỉ có con số là sai:

1. Appwrite chuẩn hóa mọi cột `datetime` thành ISO đầy đủ (`2026-08-15T00:00:00.000+00:00`).
   Domain làm việc với ngày nghiệp vụ `YYYY-MM-DD`, nên `isBusinessDateString()` từ chối giá trị
   đọc lên: KPI “Quá hạn” tụt từ 5 xuống 0, “còn N ngày” thành `—`, lịch tháng trống trơn.
2. `created_at`/`updated_at`/`id` của domain là metadata hệ thống (`$createdAt`…). Truy vấn sắp
   xếp theo tên domain bị Appwrite trả về `Attribute not found in schema`.

**Quyết định.** Cột nào là ngày nghiệp vụ được đánh dấu `businessDate: true` ngay trong
`schema.ts`; driver suy ra bảng tra cứu từ đó và dịch **hai chiều** ở đúng một chỗ
(`appwrite-mapping.ts`): đọc thì ISO → `YYYY-MM-DD` theo `APP_TIMEZONE`, ghi thì neo vào 00:00
giờ Việt Nam, và đổi tên trường hệ thống trước khi gửi query.

**Hệ quả.** Phần dịch là hàm thuần, tách khỏi driver để test được — `appwrite-mapping.test.ts`
(20 test) phủ cả vòng ghi-rồi-đọc, để lỗi cùng loại không tái diễn khi thêm cột mới. Mọi cột
`datetime` mới **bắt buộc** phải quyết định là ngày nghiệp vụ hay mốc thời gian.

---

## ADR-017 — Ghi đè phân giải DNS ở phạm vi tiến trình (chỉ cho môi trường mạng lỗi)

**Bối cảnh.** Mạng tại máy lập trình chặn/cướp DNS của `sslip.io`: mọi bản ghi, kể cả bản ghi kiểm
chứng `127-0-0-1.sslip.io`, đều trả về IP parking `208.91.112.55` — ngay cả khi hỏi thẳng Google
DNS và Cloudflare DNS. Server Appwrite vẫn hoạt động bình thường. Node `fetch` xoá header `Host`
nên không thể lách bằng cách gọi thẳng IP.

**Quyết định.** Thêm `installAppwriteDnsOverride()`: đặt global dispatcher của undici với hàm
`lookup` tuỳ biến, chỉ ánh xạ **đúng một hostname** khai báo trong `APPWRITE_RESOLVE_HOST` →
`APPWRITE_RESOLVE_IP`; mọi hostname khác đi theo DNS hệ thống. Mặc định **tắt** khi hai biến này
trống.

Đây là “file hosts ở phạm vi tiến trình”: chỉ đổi bước tra IP, không đụng URL, Host header hay TLS.
`node-appwrite` gọi `fetch` của package `undici` nên cách này có hiệu lực; vì vậy `undici` được khai
báo thành dependency tường minh thay vì phụ thuộc bắc cầu.

**Hệ quả.** Production **không** dùng cơ chế này — hạ tầng thật phải có DNS đúng và HTTPS. Khi mạng
đã phân giải được (ví dụ sau khi thêm entry vào file `hosts`), xoá hai biến môi trường là cơ chế tự
tắt, không cần sửa mã.

---

## Nhật ký phê duyệt

| ADR | Ngày | Người quyết định | Ghi chú |
|---|---|---|---|
| ADR-001…015 | 12/08/2026 | Đội phát triển | Quyết định kỹ thuật, chờ PO phản hồi các mục trong `NEED_CONFIRMATION.md` |
| ADR-016…017 | 12/08/2026 | Đội phát triển | Phát sinh khi đưa dữ liệu thật lên Appwrite self-hosted của BOC |
