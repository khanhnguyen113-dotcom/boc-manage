# TRACEABILITY — Google Sheet → Guideline → Mã nguồn → Test

Mục đích: với bất kỳ quy tắc nào trong Sheet nguồn hoặc guideline, tìm được **chính xác** nó nằm ở
file nào và test nào đang bảo vệ nó. Dùng khi nghiệm thu (guideline mục 23) và khi đối soát sau
import (mục 12.5).

---

## 1. Từ tab của Sheet sang webapp

| Tab Sheet nguồn | Vai trò trong Sheet | Nơi thể hiện trong webapp | Ghi chú |
|---|---|---|---|
| Hướng dẫn | 5 quy tắc nhập liệu | Text trợ giúp trong form + validation Zod | Quy tắc trở thành ràng buộc thật, không còn là lời nhắc |
| Trung tâm nhập liệu | Bảng master từ L3 trở xuống | `work_items` (bảng duy nhất) | ADR-001 |
| Nhật ký thực hiện (trong master) | Từng lần thực hiện | `execution_logs` | Nguồn duy nhất của số liệu định kỳ |
| Lớp 1–Lớp 2 | Phân loại quản trị | `management_levels`, `work_categories` | |
| Lớp 3 / 4 / 5 / 6 | 4 tab lặp cột của nhau | View có filter `level = n` | Không còn 4 bản sao dữ liệu |
| Bản đồ công việc | P1, quá hạn, tải, cây | `/dashboard` Control Tower | |
| Lớp tổng hợp | Điểm cuối + tải người | `is_leaf` + `/workload` | |
| Tra cứu quan hệ cha–con | Dò cha bằng công thức | Breadcrumb + `/work-map` | |
| `_DM_Dropdown`, Danh mục chọn | Danh mục | `domain/catalogs.ts` + bảng danh mục | |
| Ngày nghỉ lễ | Lịch nghiệp vụ | `holidays` + `/admin/holidays` | Cờ `is_confirmed` cho ngày “tham chiếu” |
| Báo cáo ngày/tuần/tháng/năm | 4 sheet công thức | `/reports` dùng chung một report service | Không còn `#REF!` |

## 2. Business rule → mã nguồn → test

| ID | Rule (guideline mục 8) | Cài đặt | Test |
|---|---|---|---|
| BR-HIE-001 | L4 cha L3, L5 cha L4, L6 cha L5 | `domain/hierarchy.ts` `requiredParentLevel`, `validateParentRelation` | `hierarchy.test.ts` |
| BR-HIE-002 | Chống self-parent và cycle | `validateParentRelation` (đi ngược lên gốc) | `hierarchy.test.ts` |
| BR-HIE-003 | Con kế thừa năm, L1, L2, root | `services/work-items.ts` `createWorkItem`/`updateWorkItem` | — |
| BR-HIE-004 | `is_leaf` = không có con active | `computeIsLeaf` | `hierarchy.test.ts` |
| BR-HIE-005 | Chặn lưu trữ khi còn con active | `archiveWorkItem` | — |
| BR-HIE-006 | Không hard delete | Không có API xóa; `is_archived` / `CANCELLED` | ADR-005 |
| BR-PRO-001 | Chỉ leaf nhập tiến độ | `computeEffectiveProgress`, chặn ở `quickUpdateWorkItem` | `progress.test.ts` |
| BR-PRO-002 | Cha = trung bình con hợp lệ | `computeEffectiveProgress` | `progress.test.ts` |
| BR-PRO-003 | Loại `CANCELLED`, `NOT_SCHEDULED`, `SCHEDULED` | `progressExclusionFor` | `progress.test.ts` |
| BR-PRO-004 | Loại nhóm “Công việc khác” | `CATEGORIES_EXCLUDED_FROM_PROGRESS` | `progress.test.ts` |
| BR-PRO-005 | Cha không có con hợp lệ | `computeEffectiveProgress` nhánh `NO_DATA` | `progress.test.ts` |
| BR-PRO-006 | Recalc lên gốc, idempotent | `domain/recalc.ts` + `recalculateAndPersist` | `recalc.test.ts` |
| BR-STA-001 | Hoàn thành cần 100% + ngày + output + evidence | `completionBlockers` | `status.test.ts` |
| BR-STA-002…007 | Cảnh báo trạng thái không nhất quán | `statusWarnings` | `status.test.ts` |
| BR-STA-008 | Reopen cần quyền + lý do | `isSensitiveTransition` + `changeWorkItemStatus` | `status.test.ts` |
| BR-DAT-001…004 | Ngày gốc vs hiển thị | `computeDisplayDates` | `dates.test.ts` |
| BR-DAT-005 | Cảnh báo con vượt khung, không tự sửa | `childBaselineWarnings` | `dates.test.ts` |
| BR-DAT-006 | Kết thúc trước bắt đầu là invalid | `endBeforeStart` + Zod refine | `dates.test.ts` |
| BR-DAT-007 | Business date theo `Asia/Ho_Chi_Minh` | `server/clock.ts` | ADR-007 |
| 8.5 | Ngày làm việc, ngày nghỉ | `domain/business-days.ts` | `business-days.test.ts` |
| 8.6 | Quá hạn, giờ còn lại | `isOverdue`, `remainingHours` | `dates.test.ts`, `progress.test.ts` |
| BR-LOD-001…006 | Giờ, phân bổ, tải, công suất | `domain/workload.ts` | `workload.test.ts` |
| BR-REC-001…005 | Nhật ký định kỳ/phát sinh | `domain/execution.ts` | `execution.test.ts` |
| 8.9 | 18 mã lỗi chất lượng dữ liệu | `domain/data-quality.ts` | `data-quality.test.ts` |
| 8.10 | Khung 40/25/25/10 | `FAIRNESS_FRAMEWORK` — **chỉ hiển thị tham chiếu** | — |
| 4.1–4.5 | Vai trò, capability, scope | `domain/permissions.ts` | `permissions.test.ts` |
| 10 | KPI có eligible/excluded/lý do | `domain/metrics.ts` | `metrics.test.ts` |
| 11.2 | Đúng hạn, mẫu số 0 ⇒ `—` | `computePeriodReport` | `metrics.test.ts` |
| 11.3 | Số liệu định kỳ từ log | `summarizeExecutionLogs` | `execution.test.ts` |
| 11.4 | Chống formula injection | `sanitizeCell` | ADR-012 |

## 3. Công thức Sheet → cách cài đặt

| Công thức trong Sheet | Ý nghĩa | Cài đặt tương ứng |
|---|---|---|
| `AVERAGEIFS($N:$N, $D:$D, mã, $L:$L, "<>Hủy", "<>Chưa lên lịch", "<>Đã lên lịch")` | Tiến độ cha | `computeEffectiveProgress` với bộ loại trừ tương đương |
| `NETWORKDAYS.INTL(start, end, 11, holidays)` | Ngày làm việc, loại Chủ nhật | `countBusinessDays` với `MASK_MON_SAT` |
| `COUNTIF($D:$D, mã) > 0` → “Có mã con?” | Xác định điểm cuối | `computeIsLeaf` |
| `IF(unit="Tuần", hours/5, hours)` | Tải quy đổi | `toDailyLoad` với `capacityDaysPerWeek` cấu hình được |
| `MIN/MAX` ngày của con | Ngày hiển thị cha | `computeDisplayDates` |
| `IFERROR(XLOOKUP(...))` dò cha | Quan hệ cha–con | `parent_id` + `buildTreeIndex` |
| Ô tô vàng khi thiếu dữ liệu | Nhắc nhập liệu | `evaluateDataQuality` + badge + `/reports/data-health` |

**Hai công thức không được sao chép nguyên trạng:**

1. Sheet dùng `NETWORKDAYS.INTL(...;11;...)` (6 ngày/tuần) nhưng quy đổi tải lại chia 5. Webapp
   tách thành hai tham số độc lập `WORK_WEEK_MASK` và `CAPACITY_DAYS_PER_WEEK` — mâu thuẫn được
   ghi rõ ở NEED_CONFIRMATION B2/B3 thay vì bị che đi.
2. Ngưỡng cận tải xuất hiện cả `80%` (tab Danh mục) và `85%` (các sheet báo cáo). Webapp dùng một
   tham số `near_capacity_threshold` sửa được trên UI, mặc định `0.85` — NEED_CONFIRMATION B4.

## 4. Yêu cầu chức năng → màn hình

| Guideline | Yêu cầu | Màn hình |
|---|---|---|
| 6.1 | Control Tower, KPI, drill-down | `/dashboard` |
| 6.2 | Cây, bảng, chi tiết, form công việc | `/work-map`, `/work-items`, `/work-items/[id]`, `/work-items/new`, `/work-items/[id]/edit` |
| 6.3 | My Work + quick update | `/my-work` |
| 6.4 | Execution logs | tab “Nhật ký” trong chi tiết công việc |
| 6.5 | Workload & capacity | `/workload` |
| 6.6 | Calendar & deadlines | `/calendar` |
| 6.7 | Comments, mentions, activity | tab “Bình luận”, “Hoạt động” |
| 6.8 | Notifications | `/notifications` + chuông trên topbar |
| 6.9 / 11 | Reports & export | `/reports`, `/reports/data-health`, `/api/exports/*` |
| 6.10 | Admin | `/admin/{users,organization,catalogs,holidays,settings,imports,audit}` |
| 18.2 | Health/readiness | `/api/health`, `/api/ready` |

## 5. Tiêu chí nghiệm thu (mục 23) → cách kiểm chứng

| Tiêu chí | Kiểm chứng |
|---|---|
| Tạo từ L3 xuống không giới hạn độ sâu, chặn sai quan hệ/cycle | `hierarchy.test.ts` (20 test) + validation trong form |
| Progress chỉ nhập leaf, roll-up đúng | `progress.test.ts`, `recalc.test.ts` |
| Baseline/display dates và cảnh báo con | `dates.test.ts` + banner cảnh báo ở trang chi tiết |
| Status/transition/completion evidence | `status.test.ts` + `StatusPanel` chỉ hiện bước hợp lệ |
| Recurring/ad-hoc và giờ thực tế | `execution.test.ts` + tab Nhật ký |
| Workload không kết luận khi thiếu dữ liệu | `workload.test.ts` + badge “Chưa đủ dữ liệu” |
| Báo cáo đối soát đúng | `metrics.test.ts` + sheet “Filters & Definitions” trong file export |
| Drill-down từ KPI về đúng record | `filters.test.ts` + mọi `KpiCard` đều có `href` |
| Mỗi role/capability/scope pass matrix | `permissions.test.ts` (20 test) |
| Direct API/client tampering không bypass | `canReadWorkItem`/`canWriteWorkItem` gọi ở service, không ở component |
| Revoke/inactive hiệu lực request kế tiếp | `effectiveCapabilities` trả rỗng khi `is_active = false` |
| Export tuân thủ scope | `/api/exports/*` dùng chung `searchWorkItems(query, scope)` |
| Sensitive action có audit before/after/reason | `recordAudit` trong mọi mutation + `/admin/audit` |
| Không mang `#REF!` sang webapp | `extract-sheet.ts` loại dòng lỗi, ghi biên bản |

**Chưa kiểm chứng được bằng test tự động:** E2E Playwright (mục 22.3) — cần môi trường staging.
Đã khai báo ở mục 8 của `IMPLEMENTATION_PLAN.md`.
