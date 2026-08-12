# RUNBOOK — Vận hành BOC Control Tower

Guideline mục 18–20. Tài liệu này dành cho người vận hành, không phải người phát triển.

---

## 1. Kiến trúc triển khai (Dokploy)

```text
VPS / Dokploy
├── boc-web        Next.js standalone, cổng 3000
├── Appwrite stack project riêng cho BOC (nhiều container, có state)
├── monitoring     uptime + log
└── backup jobs    → object storage/NAS offsite
```

`NEED_CONFIRMATION E2`: domain, VPS và việc Appwrite dùng chung hay riêng chưa được BOC chốt.
Đề xuất: `boc.hongha.com.vn` và `appwrite.<domain>` nội bộ.

## 2. Deploy

```text
feature branch → PR
  → lint + typecheck + test + build + verify:schema
  → deploy staging → smoke test → UAT
  → phê duyệt → deploy production → readiness check → theo dõi 30 phút
```

Không auto-deploy production chỉ vì push `main`.

### Trước mỗi lần deploy

1. `npm run verify:all` phải xanh.
2. `DATA_DRIVER=appwrite npm run verify:schema` phải xanh — nếu báo thiếu bảng/cột/index thì chạy
   `npm run bootstrap:appwrite` **trên staging trước**, đối chiếu manifest, rồi mới tới production.
3. Backup database + storage ngay trước khi chạy migration hoặc import lớn.

### Sau khi deploy

```bash
curl -fsS https://<domain>/api/health   # 200 = tiến trình sống
curl -fsS https://<domain>/api/ready    # 200 = kết nối được kho dữ liệu
```

`/api/ready` trả `data_store.driver`. Nếu thấy `local` ở production là **sự cố cấu hình nghiêm
trọng** — ứng dụng lẽ ra phải từ chối khởi động; kiểm tra lại biến môi trường ngay.

## 3. Rollback

1. Deploy lại image tag trước đó (image có version, không dùng `latest`).
2. Schema Appwrite **không** tự rollback. Bootstrap chỉ thêm, không xóa, nên image cũ vẫn chạy
   được với schema mới. Nếu buộc phải hoàn nguyên schema, khôi phục từ backup.
3. Ghi lại: thời điểm, lý do, tag trước/sau, ai phê duyệt.

## 4. Backup

| Đối tượng | Tần suất | Ghi chú |
|---|---|---|
| Database của Appwrite | Hằng ngày + trước mỗi deploy/migration/import lớn | |
| Storage volume (bucket file) | Hằng ngày, incremental | Backup DB mà không backup storage là **không đủ** |
| Cấu hình Appwrite/Dokploy, biến môi trường | Mỗi lần thay đổi | Lưu ở nơi có kiểm soát truy cập |
| Mã nguồn, schema manifest, mapping import | Theo git | |
| Metadata audit/export | Theo database | |

Đề xuất (`NEED_CONFIRMATION E4`): giữ 14 bản ngày, 8 bản tuần, 12 bản tháng. Bản offsite mã hóa là
**bắt buộc** cho production. RPO 24 giờ, RTO 4 giờ.

### Diễn tập khôi phục

Hàng quý và sau mỗi thay đổi hạ tầng lớn. Ghi lại: thời điểm bắt đầu/kết thúc, thời gian khôi phục
thực tế, ai thực hiện, kết quả kiểm tra dữ liệu sau khôi phục. **Backup chưa từng khôi phục thử
thì chưa phải là backup.**

## 5. Giám sát

| Chỉ số | Ngưỡng cảnh báo đề xuất |
|---|---|
| `/api/ready` thất bại | 2 lần liên tiếp |
| Tỷ lệ HTTP 5xx | > 2% trong 5 phút |
| p95 thời gian phản hồi | > 3 giây kéo dài |
| Đĩa | > 80% |
| Backup gần nhất | > 26 giờ |
| Bản ghi outbox cũ nhất chưa xử lý | > 10 phút |
| Đăng nhập thất bại | Tăng đột biến bất thường |
| Tỷ lệ chất lượng dữ liệu | Giảm dưới ngưỡng đã thống nhất |

Log có cấu trúc, các trường: `timestamp`, `level`, `service`, `request_id`, `user_id`,
`route/action`, `entity_id`, `duration_ms`, `result/error_code`. **Không bao giờ** log mật khẩu,
session secret, API key hay nội dung tệp.

## 6. Xử lý sự cố thường gặp

### Người dùng báo “không thấy công việc của tôi”

1. Mở `/profile` bằng chính tài khoản đó — trang hiển thị vai trò, phạm vi và toàn bộ capability
   đang có hiệu lực.
2. Nếu phạm vi sai: kiểm tra `/admin/users` và người quản lý của đơn vị trong `/admin/organization`.
3. Quyền được nạp lại mỗi request, nên sau khi sửa chỉ cần tải lại trang, không cần đăng xuất.

### Số liệu dashboard “sai”

1. Xem phần “Đã loại N bản ghi” ngay trên thẻ KPI — thường là do rule loại trừ chứ không phải lỗi.
2. Kiểm tra `/reports/data-health`: bản ghi `INVALID` bị loại khỏi kết luận quản trị.
3. Kiểm tra `/admin/settings`: đổi ngưỡng tải hoặc lịch làm việc sẽ đổi toàn bộ con số dẫn xuất.
4. Nếu nghi cache giá trị dẫn xuất bị lệch: chạy `npm run import:dry-run`, script báo số bản ghi
   lệch giữa cache và giá trị tính lại.

### Đổi tham số nghiệp vụ

Luôn qua `/admin/settings`, không sửa code. Ghi lý do — hệ thống lưu giá trị trước/sau vào audit
log và làm mới toàn bộ màn hình phân tích.

### Nhân sự nghỉ việc

1. Đặt trạng thái hồ sơ thành `INACTIVE` — mọi quyền mất hiệu lực ở request kế tiếp.
2. **Không xóa** hồ sơ: audit log, lịch sử công việc và báo cáo cũ tham chiếu tới người này.
3. Chuyển giao việc đang mở qua màn hình chỉnh sửa công việc (có ghi audit).

## 7. Thông tin liên hệ

| Vai trò | Người phụ trách |
|---|---|
| Product Owner nghiệp vụ | `NEED_CONFIRMATION A1` |
| System owner sau go-live | `NEED_CONFIRMATION A1` |
| Technical admin / DevOps | `NEED_CONFIRMATION A1` |
| Người được phép khôi phục backup | `NEED_CONFIRMATION E4` |

Điền bảng này trước khi go-live — sự cố lúc 2 giờ sáng không phải lúc đi tìm ai chịu trách nhiệm.
