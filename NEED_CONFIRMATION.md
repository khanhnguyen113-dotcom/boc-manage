# NEED_CONFIRMATION — Danh sách quyết định chờ BOC chốt

> Nguồn: `BOC_WEBAPP_GUIDELINE_NEXTJS_APPWRITE.md` (mục 27) + các mâu thuẫn quan sát được
> trong Google Sheet *“Bản sao của BOC_Form_QTCV_5 LỚP_Final”*.
>
> **Quy tắc:** mọi mục dưới đây đang chạy bằng **giá trị cấu hình tạm thời** (ghi rõ ở cột
> “Giá trị tạm dùng”). Giá trị tạm **không được dùng làm tiêu chí nghiệm thu**. Khi BOC chốt,
> cập nhật `DECISIONS.md` + biến môi trường/`system_settings`, **không sửa rải rác trong code**.

Mức độ chặn:

- 🔴 **BLOCKING** — sai thì số liệu quản trị sai, phải chốt trước UAT.
- 🟠 **IMPORTANT** — ảnh hưởng trải nghiệm/vận hành, chốt trước go-live.
- 🟡 **LATER** — có thể chốt trong hypercare.

---

## A. Tổ chức & nghiệm thu

| # | Câu hỏi | Mức | Giá trị tạm dùng | Điểm chạm trong code |
|---|---|:--:|---|---|
| A1 | Product Owner nghiệp vụ / người nghiệm thu cuối / system owner là ai? | 🟠 | Chưa gán; `boc_director` seed = **GĐ BOC** | `data/seed/users.json` |
| A2 | Danh sách user, đơn vị, manager và quan hệ quản lý chính thức? | 🔴 | 5 người + 7 đơn vị lấy từ `_DM_Dropdown` của Sheet | `data/seed/users.json`, `units.json` |
| A3 | Email thật của từng thành viên (Sheet chỉ có biệt danh “GĐ BOC”, “Em Đại”, “Ms Trang”, “Thu Trang”, “Team PTSP”) | 🔴 | Sinh email giả `<slug>@boc.local` | `data/seed/users.json` |
| A4 | Đăng nhập email/password hay SSO; có 2FA không? | 🟠 | Email + password (Appwrite Auth), không SSO/2FA | `src/server/auth/*` |
| A5 | System admin có được đọc toàn bộ nội dung nghiệp vụ không? | ✅ Đã chốt 13/08/2026 | **Có**: `system_admin` là super admin, có toàn bộ capability và phạm vi `ALL` | `src/domain/permissions.ts` |

## B. Quy tắc tính toán (ảnh hưởng trực tiếp con số)

| # | Câu hỏi | Mức | Giá trị tạm dùng | Điểm chạm |
|---|---|:--:|---|---|
| B1 | Tiến độ cha: **average đều** (như Sheet) hay **weighted theo giờ**? | 🔴 | `average` đều — đúng Sheet, để đối soát import | `PROGRESS_ROLLUP_MODE` |
| B2 | Tuần làm việc 5 hay 6 ngày? Thứ Bảy có phải business day? | 🔴 | `WORK_WEEK_MASK=MON_SAT` (loại Chủ nhật, giống `NETWORKDAYS.INTL(...,11,...)` của Sheet) | `CAPACITY_DAYS_PER_WEEK`, `WORK_WEEK_MASK` |
| B3 | Quy đổi giờ/tuần → giờ/ngày chia **5** hay **6**? Sheet dùng `/5` trong khi business day lại là 6 ngày ⇒ **mâu thuẫn** | 🔴 | `CAPACITY_DAYS_PER_WEEK=5` (giữ đúng số liệu Sheet để reconcile) | `src/domain/workload.ts` |
| B4 | Ngưỡng cận tải: danh mục Sheet ghi **80%**, báo cáo ngày/tuần/tháng ghi **85%** ⇒ **mâu thuẫn** | 🔴 | `NEAR_CAPACITY_THRESHOLD=0.85` (theo bản báo cáo, mới hơn) | `system_settings.near_capacity_threshold` |
| B5 | “Deadline trong 7 ngày” là calendar days hay business days? | 🟠 | **Business days** (`DEADLINE_WARNING_BUSINESS_DAYS=7`) | `src/domain/business-days.ts` |
| B6 | Công thức đánh giá 40/25/25/10 có áp dụng không, ai được xem? | 🟠 | Chỉ **hiển thị khung tham khảo**, không chấm điểm cá nhân | `src/app/(portal)/reports` |
| B7 | Danh sách ngày nghỉ 2026/2027 chính thức từ HR? | 🔴 | 10 ngày 2026 lấy từ tab *Ngày nghỉ lễ*, trong đó **6 ngày đang ghi “BOC/HR xác nhận”** | `data/seed/holidays.json` |
| B8 | Công suất chuẩn giờ/ngày | 🟠 | `8.0` (theo Sheet) | `DEFAULT_CAPACITY_HOURS_PER_DAY` |

## C. Quy trình & quyền

| # | Câu hỏi | Mức | Giá trị tạm dùng | Điểm chạm |
|---|---|:--:|---|---|
| C1 | Member tự hoàn thành hay cần Lead xác nhận? | 🔴 | Member **được tự hoàn thành** nếu đủ evidence; không có bước duyệt | `work.complete` |
| C2 | Ai được tạo L3 / reparent / đổi P1 / đổi deadline / đổi assignee? | 🔴 | `boc_director`, `business_admin`, `unit_manager` (trong scope) | `src/domain/permissions.ts` |
| C3 | Công việc cha có được complete thủ công không? | 🟠 | **Không** — parent luôn derived từ con | `BR-PRO-002` |
| C4 | Hoàn thành bắt buộc evidence loại nào? | 🔴 | `expected_output` + (**result_link** *hoặc* file kết quả) | `BR-STA-001` |
| C5 | Rule khóa record sau kỳ báo cáo; cửa sổ sửa execution log? | 🟠 | Chưa khóa; `EXECUTION_LOG_EDIT_WINDOW_HOURS=72` | `system_settings` |
| C6 | Mỗi priority có SLA/nhắc việc gì? | 🟡 | Chỉ nhắc theo deadline chung, chưa có SLA riêng | `src/server/services/notification-service.ts` |
| C7 | Email notification có nằm trong MVP không? | 🟠 | **Không** — chỉ in-app | mục 6.8 |

## D. Dữ liệu & migration

| # | Câu hỏi | Mức | Giá trị tạm dùng | Điểm chạm |
|---|---|:--:|---|---|
| D1 | Mã công việc mới: giữ convention `CT/RD/DL/XK` hay format mới `HH-L3-2026-000123`? | 🟠 | **Giữ legacy khi import**, **sinh mã mới theo format `HH-L{n}-{year}-{seq}`** | `src/server/services/code-service.ts` |
| D2 | Ngày freeze/cutover; có nhập delta không? Sheet read-only bao lâu? | 🟠 | Chưa đặt lịch | `docs/` |
| D3 | Sheet nguồn có `#REF!` ở nhiều vùng (L4/L5 và báo cáo ngày/tuần) — xử lý thế nào? | 🔴 | Import **bỏ qua dòng `#REF!`**, ghi vào `import_errors`; derived tính lại trong app | `scripts/import-google-sheet.ts` |
| D4 | Có record ngày kết thúc < ngày bắt đầu (vd `HHL5DL04-03`: bắt đầu 06/10/2026, kết thúc 10/09/2026; `HHL5DL07-03`; `HHL3XK01`) | 🔴 | Import ở trạng thái `INVALID` + code `END_BEFORE_START`, hiển thị trong Data Health | `src/domain/data-quality.ts` |
| D5 | Timezone Sheet là `America/Los_Angeles` | 🔴 | Chuẩn hóa toàn bộ về `Asia/Ho_Chi_Minh` | `APP_TIMEZONE` |
| D6 | Đơn vị phụ trách của nhóm mã `HHL3XK*` đang gán “Dữ liệu điều hành” dù là việc Kinh doanh quốc tế | 🟠 | Giữ nguyên như nguồn, gắn cờ cần rà soát | `data/seed/work-items.json` |
| D7 | **19 công việc chưa có Lớp 1/Lớp 2**: các mã `HHL3MKT*`, `HHL3KH&CƯ*`, `HHL3XK*`, `HHL3DL1*` không xuất hiện trên tab “Lớp 3” nên không có phân loại quản trị | 🔴 | Gán tạm `Cấp phòng ban` + `Công việc khác`. Nhóm `OTHER` vốn bị loại khỏi tiến độ trung bình nên lựa chọn này **không làm sai KPI**, nhưng cũng khiến 19 việc này không xuất hiện trong tiến độ quản trị | `scripts/seed.ts` `FALLBACK_*`, xem `/admin/imports` |
| D8 | 4 công việc L6 (`HHL5RD05-01.01`…`.04`) trỏ tới cha `HHL5RD05-01` **không tồn tại** trong bảng master | 🔴 | Bị loại khỏi import, ghi vào biên bản lỗi. Không tạo cha giả (guideline 12.4). BOC cần bổ sung dòng L5 tại nguồn | `data/seed/extraction-report.json` |

## E. Hạ tầng

| # | Câu hỏi | Mức | Giá trị tạm dùng | Điểm chạm |
|---|---|:--:|---|---|
| E1 | Mã màu **Hồng Hà red** chính thức + file logo brand | 🟠 | Placeholder `#C8102E` — **phải thay bằng mã brand thật** | `src/app/globals.css` (`--brand-*`) |
| E2 | Domain, VPS, Appwrite dùng chung hay riêng, tài nguyên? | 🟠 | `boc.hongha.com.vn` (đề xuất), Appwrite project riêng | `.env.example` |
| E3 | Loại file, kích thước tối đa, virus scan, retention? | 🟠 | 25 MB/file, 10 file/record, không virus scan | `src/config/files.ts` |
| E4 | RPO/RTO/retention backup và người thực hiện restore? | 🟠 | RPO 24h / RTO 4h (đề xuất) | `docs/RUNBOOK.md` |
| E5 | Quy mô user/concurrent/record/storage? | 🟡 | Ước tính ≤ 50 user, ≤ 20 concurrent | `docs/` |
| E6 | Retention audit log | 🟡 | 24 tháng | `system_settings` |

---

## Cách đóng một mục

1. BOC xác nhận bằng văn bản/biên bản.
2. Ghi vào `DECISIONS.md` (ADR có ngày, người duyệt).
3. Đổi giá trị ở **một nơi**: `.env` hoặc `system_settings` (không hard-code).
4. Cập nhật/bổ sung unit test tương ứng trong `src/domain/__tests__`.
5. Xóa dòng khỏi bảng trên hoặc đánh dấu ✅ kèm số ADR.
