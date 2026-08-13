# Triển khai BOC Control Tower bằng Dokploy + Nixpacks

Đây là phương án triển khai **Application/Nixpacks**, độc lập với phương án Docker Compose trong
`docs/DOKPLOY.md`. Không tạo thêm Appwrite trong application này; Appwrite phải là stack riêng có
volume và backup riêng.

> Nixpacks hiện ở maintenance mode nhưng vẫn được Dokploy hỗ trợ. `nixpacks.toml` được giữ tường
> minh để build có thể lặp lại; khi hạ tầng chuyển sang Railpack, cần kiểm thử một bản staging riêng.

## 1. Cấu hình Application

1. Trong Dokploy, tạo **Project → Environment → Application**.
2. Chọn GitHub repository `khanhnguyen113-dotcom/boc-manage`, branch `main`, build path `/`.
3. Chọn **Build Type: Nixpacks**.
4. Để trống **Publish Directory** vì đây là Next.js server, không phải static site.
5. Không override Install/Build/Start Command trong UI. Dokploy sẽ đọc `nixpacks.toml` ở root:
   - Node.js 22 từ `.nvmrc`;
   - install bằng lockfile;
   - build Next.js standalone bằng Webpack tiết kiệm RAM, một worker, heap tối đa 768 MB;
   - chép đủ static/public asset;
   - start bằng `node .next/standalone/server.js`.
6. Trong tab **Environment**, thêm các biến ở mục 2 rồi Deploy.

## 2. Biến môi trường

```dotenv
# Bắt buộc
APP_URL=https://boc.example.com
DATA_DRIVER=appwrite
SESSION_SECRET=thay-bang-chuoi-base64url-ngau-nhien-toi-thieu-32-ky-tu
APPWRITE_ENDPOINT=https://appwrite.example.com/v1
APPWRITE_PROJECT_ID=your-project-id
APPWRITE_SERVER_API_KEY=your-server-api-key
# Hoặc dùng tên Dokploy đang có (chỉ cần một trong hai key):
# APPWRITE_API_KEY=your-server-api-key

# Khuyến nghị: Git SHA/release id, đổi theo mỗi bản build
NEXT_DEPLOYMENT_ID=git-sha-or-release-id

# ID mặc định — chỉ đổi nếu Appwrite dùng ID khác
APPWRITE_DATABASE_ID=boc_control_tower
APPWRITE_BUCKET_ATTACHMENTS=boc_attachments
APPWRITE_BUCKET_IMPORTS=boc_imports
APPWRITE_BUCKET_EXPORTS=boc_exports

APP_NAME=BOC Control Tower
APP_TIMEZONE=Asia/Ho_Chi_Minh
APP_LOCALE=vi-VN
SESSION_COOKIE_NAME=hh_boc_session
SESSION_MAX_AGE_SECONDS=28800

WORK_WEEK_MASK=MON_SAT
CAPACITY_DAYS_PER_WEEK=5
DEFAULT_CAPACITY_HOURS_PER_DAY=8
NEAR_CAPACITY_THRESHOLD=0.85
DEADLINE_WARNING_BUSINESS_DAYS=7
PROGRESS_ROLLUP_MODE=average
EXECUTION_LOG_EDIT_WINDOW_HOURS=72

LOG_LEVEL=info
DEBUG_SQL=false
```

Không đặt `NIXPACKS_INSTALL_CMD`, `NIXPACKS_BUILD_CMD` hoặc `NIXPACKS_START_CMD` trong Dokploy vì
chúng có độ ưu tiên cao hơn và sẽ ghi đè `nixpacks.toml`. Không đưa secret vào `NEXT_PUBLIC_*`.

`DATA_DRIVER=appwrite` đã được cố định trong `nixpacks.toml` cho cả build và runtime. Các biến
`APPWRITE_API_KEY_AUTH` và `APPWRITE_API_KEY_DATA` không thay thế cho server key; ứng dụng cần
`APPWRITE_SERVER_API_KEY` hoặc alias `APPWRITE_API_KEY`. `SESSION_SECRET` vẫn phải được khai báo
trên Dokploy vì secret này phải ổn định giữa các lần restart và giữa các replica.

Nếu build báo `JavaScript heap out of memory`, sửa có chủ đích giá trị `768` trong lệnh build của
`nixpacks.toml` lên `1024`; không đặt heap không giới hạn vì Dokploy build trên cùng VPS production.

## 3. Domain và HTTPS

Trong tab **Domains**, thêm domain với:

- Container Port: `3000`
- Path: `/`
- HTTPS: bật
- Certificate: `letsencrypt`

Không thêm published port ở **Advanced → Ports**. DNS phải trỏ về VPS trước khi xin certificate.

## 4. Health check và rollback

Trong **Advanced → Cluster Settings → Swarm Settings → Health Check**, dùng:

```json
{
  "Test": [
    "CMD",
    "node",
    "-e",
    "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  ],
  "Interval": 30000000000,
  "Timeout": 5000000000,
  "StartPeriod": 30000000000,
  "Retries": 3
}
```

Update Config đề xuất cho một replica và rollback tự động:

```json
{
  "Parallelism": 1,
  "Delay": 10000000000,
  "FailureAction": "rollback",
  "Order": "start-first"
}
```

Sau khi Save các thiết lập Swarm, chọn **Redeploy** để áp dụng.

## 5. Kiểm tra sau deploy

```bash
curl -fsS https://boc.example.com/api/health
curl -fsS https://boc.example.com/api/ready
```

Kết quả hợp lệ: cả hai trả HTTP 200 và `/api/ready` có `data_store.driver=appwrite`. Sau đó đăng
nhập bằng tài khoản Appwrite thật, mở một danh sách công việc và kiểm tra log deployment.

`Successfully Built` chỉ xác nhận image đã được tạo, không xác nhận tiến trình server đã chạy.
Nếu app chưa lên, mở log của container/deployment mới nhất và tìm `Invalid environment configuration`
hoặc `Server startup failed`; đây mới là runtime log cần dùng để chẩn đoán lỗi khởi động.
