# BOC Control Tower

**Trung tâm Điều hành Công việc BOC** — Công ty Cổ phần Văn phòng phẩm Hồng Hà.

Không gian làm việc chung của toàn trung tâm: tạo và giao việc, cập nhật tiến độ hằng ngày, theo
dõi deadline và tải nguồn lực, báo cáo có truy vết tới từng bản ghi nguồn.

Xây theo `BOC_WEBAPP_GUIDELINE_NEXTJS_APPWRITE.md` — Next.js 16 App Router · TypeScript strict ·
Tailwind CSS 4 · Zod · Appwrite Auth/TablesDB/Storage · Recharts · ExcelJS · Vitest · Docker/Dokploy.

---

## 1. Chạy thử trong 3 phút

```bash
npm install
cp .env.example .env.local
npm run seed
npm run dev
```

Mở <http://localhost:3000>. Kho dữ liệu mặc định là file JSON local đã nạp **dữ liệu thật trích từ
Google Sheet nguồn**: 118 công việc L3–L5, 7 đơn vị, 11 ngày nghỉ.

Tài khoản demo (mật khẩu chung lấy từ `LOCAL_DEV_PASSWORD`, mặc định `boc@2026`):

| Email | Vai trò | Nhìn thấy gì |
|---|---|---|
| `gd.boc@boc.local` | Giám đốc BOC | Toàn bộ dữ liệu BOC |
| `business.admin@boc.local` | Quản trị nghiệp vụ | Toàn bộ + quản trị danh mục, import, audit |
| `dai.nguyen@boc.local` | Quản lý đơn vị | Đơn vị Dữ liệu điều hành |
| `trang.tran@boc.local` | Quản lý đơn vị | Đơn vị R&D |
| `trang.le@boc.local` | Thành viên | Chỉ việc mình tạo/được giao/phối hợp |
| `sysadmin@boc.local` | Quản trị hệ thống | Vận hành kỹ thuật, **không** đọc nội dung nghiệp vụ |

> Đăng nhập bằng hai tài khoản khác nhau là cách nhanh nhất để thấy phân quyền hoạt động: cùng một
> URL cho ra hai tập dữ liệu khác nhau, và các nút thao tác xuất hiện/biến mất theo capability.

## 2. Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy development |
| `npm run build` / `npm start` | Build và chạy production |
| `npm test` | 200 unit test cho business rules |
| `npm run typecheck` | TypeScript strict, không lỗi |
| `npm run lint` | ESLint |
| `npm run verify:all` | typecheck + lint + test — chạy trước khi commit |
| `npm run extract:sheet` | Trích lại dữ liệu từ bản chụp Sheet trong `data/source/` |
| `npm run seed` | Nạp dữ liệu vào kho đang cấu hình (local hoặc Appwrite) |
| `npm run check:appwrite` | Kiểm tra kết nối Appwrite và đếm bản ghi từng bảng, không ghi gì |
| `npm run bootstrap:appwrite` | Tạo database/table/column/index/bucket trên Appwrite (idempotent) |
| `npm run verify:schema` | Đối chiếu schema thật với khai báo — dùng trong CI |
| `npm run import:dry-run` | Đối soát import, **không ghi** dữ liệu |
| `npm run import:production` | Ghi phiên import + biên bản lỗi |

## 3. Kiến trúc

```text
Browser
  → Next.js App Router (server components + server actions)
      → auth/session (cookie HTTP-only, ký HMAC)
      → policy: role + capability + scope          ← deny by default
      → domain services (TS thuần, có unit test)   ← nơi DUY NHẤT chứa business rules
      → repositories
          → Appwrite TablesDB   (production)
          → JSON local          (development, ADR-003)
      → audit + activity + outbox
```

Ranh giới bắt buộc:

- `src/domain/**` không import `src/server/**`, không đọc `process.env`, không gọi `new Date()`.
- `src/components/**` không import `node-appwrite` và không import repository.
- Mọi thao tác ghi đi qua `src/server/services/work-items.ts` theo đúng chuỗi của guideline 0.9:
  `authenticate → authorize → load → validate → business rules → write → recalculate → audit →
  invalidate → DTO`.

Chi tiết thư mục và phase: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
Quyết định kỹ thuật: [DECISIONS.md](DECISIONS.md).
Ánh xạ Sheet → webapp: [TRACEABILITY.md](TRACEABILITY.md).

## 4. Nghiệp vụ được cài đặt

| Nhóm rule | Ở đâu | Test |
|---|---|---|
| Cây L3–L6, cấp cha, chống cycle, điểm cuối | `domain/hierarchy.ts` | 19 |
| Cuộn tiến độ, loại trừ nhóm/trạng thái | `domain/progress.ts` | 16 |
| Ngày kế hoạch gốc vs hiển thị, cảnh báo con vượt khung | `domain/dates.ts` | 20 |
| Ngày làm việc, ngày nghỉ, quá hạn, “còn N ngày” | `domain/business-days.ts` | 18 |
| Chuyển trạng thái, điều kiện hoàn thành | `domain/status.ts` | 17 |
| Giờ, phân bổ, tải, công suất | `domain/workload.ts` | 17 |
| Nhật ký định kỳ/phát sinh | `domain/execution.ts` | 18 |
| Chất lượng dữ liệu | `domain/data-quality.ts` | 19 |
| KPI dashboard và báo cáo kỳ | `domain/metrics.ts` | 16 |
| Vai trò, capability, phạm vi dữ liệu | `domain/permissions.ts` | 20 |
| Tính lại toàn cây (idempotent) | `domain/recalc.ts` | 10 |

Ba nguyên tắc xuyên suốt, được test chứ không chỉ ghi trong tài liệu:

1. **Chỉ điểm cuối nhập tiến độ.** Công việc cha luôn là trung bình các con hợp lệ.
2. **Không kết luận trên dữ liệu thiếu.** Mẫu số 0 hiển thị `—`, không hiển thị `0%`. Thiếu tham
   số tải thì trạng thái là “Chưa đủ dữ liệu”, không phải “Bình thường”.
3. **Mọi KPI truy vết được.** Mỗi thẻ chỉ số kèm mẫu số, số bản ghi bị loại, lý do loại và link
   mở đúng danh sách nguồn.

## 5. Dữ liệu nguồn và những gì phát hiện được

`data/source/BOC_Form_QTCV_5LOP_Final.xlsx` là bản chụp Google Sheet (SHA-256 ghi trong
`data/seed/extraction-report.json`). Script trích dữ liệu **chỉ đọc**, không bao giờ sửa nguồn.

Chạy trên dữ liệu thật, hệ thống phát hiện:

- **4 công việc L6 mồ côi** — trỏ tới cha `HHL5RD05-01` không tồn tại trong bảng master. Guideline
  cấm tạo cha giả nên 4 dòng này bị loại và ghi vào biên bản lỗi.
- **19 công việc chưa có Lớp 1/Lớp 2** — không có trên tab “Lớp 3”. Được gán tạm nhóm “Công việc
  khác” (nhóm này vốn bị loại khỏi tiến độ trung bình, nên lựa chọn thận trọng không làm sai KPI).
- **3 bản ghi dữ liệu sai** và **68 bản ghi thiếu dữ liệu** trên tổng 118 — độ đầy đủ 39,8%.
- **7 ngày nghỉ chưa được HR xác nhận**, ảnh hưởng trực tiếp mọi con số “còn N ngày làm việc”.
- **Hai mâu thuẫn tham số của Sheet**: ngưỡng cận tải 80% (danh mục) vs 85% (báo cáo); tuần làm
  việc 6 ngày nhưng quy đổi tải chia 5.

Toàn bộ nằm trong `/admin/imports`, `/reports/data-health` và `NEED_CONFIRMATION.md`.

## 6. Chạy với Appwrite

```bash
npm run check:appwrite      # kiểm tra kết nối + đếm bản ghi, KHÔNG ghi gì
npm run bootstrap:appwrite  # tạo database, 23 bảng, 199 cột, 42 index, 3 bucket (idempotent)
npm run verify:schema       # đối chiếu schema thật với khai báo — dùng trong CI
npm run seed                # nạp dữ liệu + tạo tài khoản trong Appwrite Auth
```

`npm run seed` tạo luôn user trong **Appwrite Auth**: ở chế độ `DATA_DRIVER=appwrite`, xác thực đi
qua Appwrite chứ không đối chiếu hash trong database, nên thiếu bước này thì bảng `profiles` có dữ
liệu mà không ai đăng nhập được.

### Nếu mạng không phân giải được endpoint

Một số mạng chặn DNS của tên miền wildcard (`sslip.io`, `nip.io`). Cách chuẩn là thêm entry vào file
`hosts`. Nếu không có quyền admin, đặt hai biến sau để ghi đè phân giải cho **đúng một hostname**
(ADR-017, mặc định tắt):

```env
APPWRITE_RESOLVE_HOST=appwrite.example.sslip.io
APPWRITE_RESOLVE_IP=103.142.27.229
```

### Build image

Quy trình cấu hình repository, environment, domain, HTTPS và rollback trên Dokploy: [docs/DOKPLOY.md](docs/DOKPLOY.md).

```bash
docker build -t boc-control-tower:1.0.0 .
```

Biến môi trường: xem `.env.example`. Bắt buộc trước khi lên staging:

- `SESSION_SECRET` — sinh mới: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- `DATA_DRIVER=appwrite` — ứng dụng **từ chối khởi động** nếu `NODE_ENV=production` mà driver là `local`.
- `APPWRITE_SERVER_API_KEY` — chỉ đặt ở biến môi trường server, không bao giờ ở `NEXT_PUBLIC_*`.

Health check:

| Endpoint | Ý nghĩa | Dùng cho |
|---|---|---|
| `GET /api/health` | Tiến trình còn sống, không chạm database | liveness probe |
| `GET /api/ready` | Kiểm tra kết nối kho dữ liệu, trả 503 khi chưa sẵn sàng | readiness probe, load balancer |

Vận hành, backup và khôi phục: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## 7. Bảo mật

- Session trong cookie HTTP-only, `Secure` ở production, ký HMAC-SHA256. Cookie **không** chứa
  vai trò — quyền nạp lại từ server mỗi request, nên thu hồi quyền có hiệu lực ngay.
- Kiểm quyền ở server trên mọi query/mutation/export. UI chỉ ẩn nút, không bao giờ là lớp bảo vệ.
- Zod cho mọi input; link kết quả chỉ nhận `http(s)://`, chặn `javascript:`/`data:`.
- Export XLSX/CSV escape ô bắt đầu bằng `= + - @` để chống formula injection.
- Audit append-only; không bao giờ ghi mật khẩu, session hay API key.
- CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy và Permissions-Policy cấu hình
  trong `next.config.ts`.
- Không hard delete dữ liệu nghiệp vụ: dùng `is_archived` / `CANCELLED` kèm lý do.

## 8. Còn lại trước go-live

| Việc | Trạng thái |
|---|---|
| Chốt các mục 🔴 trong `NEED_CONFIRMATION.md` | ⏳ chờ BOC |
| Dựng Appwrite instance của BOC, chạy bootstrap trên staging | ⏳ chờ hạ tầng |
| Import bản Sheet đã freeze + biên bản đối soát có chữ ký | 🔶 script sẵn sàng |
| Playwright E2E theo guideline 22.3 | ❌ chưa có — cần môi trường staging |
| Upload tệp lên Appwrite Storage | 🔶 model sẵn sàng, cần bucket thật |
| Xuất PDF báo cáo điều hành | ❌ chờ chốt mẫu báo cáo |
| Email/digest, Gantt, SSO | ⏸ ngoài phạm vi MVP (guideline 2.2) |

Khoảng trống được khai báo minh bạch ở mục 8 của [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## 9. Lưu ý khi sửa mã

- Đổi tham số nghiệp vụ (ngưỡng tải, lịch làm việc, cách cuộn tiến độ) → dùng `/admin/settings`,
  **không** sửa code. Đổi có hiệu lực ngay và được ghi audit.
- Đổi màu thương hiệu → sửa khối `:root` trong `src/app/globals.css`. Màu hiện tại là
  **placeholder**, chưa phải mã brand chính thức của Hồng Hà.
- Thêm business rule → viết ở `src/domain/`, kèm test, rồi mới gọi từ service. Không viết rule
  trong React component hay trong repository.
- Thêm bảng/cột → sửa `src/server/db/schema.ts` rồi chạy `bootstrap:appwrite`. Không sửa trực tiếp
  trên Appwrite Console.
