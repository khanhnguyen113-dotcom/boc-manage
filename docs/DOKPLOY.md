# Triển khai BOC Control Tower bằng Dokploy

Tài liệu này dùng cho một ứng dụng **Docker Compose** trên Dokploy. Appwrite nên được triển khai
thành project/stack riêng có volume và backup riêng; không ghép database có state vào vòng đời
deploy của web app.

## 1. Điều kiện trước khi deploy

- VPS đã cài Dokploy, DNS `A/AAAA` của domain đã trỏ đúng về VPS.
- Appwrite đã có endpoint HTTPS mà container `boc-web` truy cập được.
- Đã chạy `npm run bootstrap:appwrite`, `npm run verify:schema` và seed/import dữ liệu cần thiết.
- Nhánh phát hành đã chạy xanh `npm run verify:all` và `npm run build`.

## 2. Tạo ứng dụng trên Dokploy

1. Tạo **Project → Environment → Docker Compose**.
2. Chọn Git provider/repository và nhánh cần triển khai.
3. Đặt **Compose Path** là `./docker-compose.yml`.
4. Bật Isolated Deployments nếu hạ tầng đang dùng chế độ này; không tự thêm `container_name`.
5. Trong tab **Environment**, dán các biến ở mục 3.
6. Deploy lần đầu.
7. Trong tab **Domains**, thêm domain cho service `boc-web`, container port `3000`, path `/`, bật
   HTTPS/Let's Encrypt. Không thêm port ở **Advanced → Ports**.

Dokploy tự ghi các biến trong tab Environment vào file `.env` cạnh Compose. File Compose này tham
chiếu tường minh từng biến `${...}`, nên chúng được inject vào container mà không cần `env_file`.

## 3. Biến môi trường production

```dotenv
# Bắt buộc
APP_URL=https://boc.example.com
SESSION_SECRET=thay-bang-chuoi-base64url-ngau-nhien-toi-thieu-32-ky-tu
APPWRITE_ENDPOINT=https://appwrite.example.com/v1
APPWRITE_PROJECT_ID=your-project-id
APPWRITE_SERVER_API_KEY=your-server-api-key

# Khuyến nghị: Git SHA hoặc release id; đổi ở mỗi bản build, không phải secret
NEXT_DEPLOYMENT_ID=git-sha-or-release-id
IMAGE_TAG=git-sha-or-release-id
# Mặc định 768 MB, chỉ tăng khi build báo JavaScript heap out of memory
NEXT_BUILD_MEMORY_MB=768

# ID mặc định — chỉ đổi nếu Appwrite dùng ID khác
APPWRITE_DATABASE_ID=boc_control_tower
APPWRITE_BUCKET_ATTACHMENTS=boc_attachments
APPWRITE_BUCKET_IMPORTS=boc_imports
APPWRITE_BUCKET_EXPORTS=boc_exports

# Tham số fallback; giá trị trong system_settings sẽ được ưu tiên
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

Sinh session secret trên máy tin cậy, rồi chỉ lưu trong secret/environment của Dokploy:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Không đưa `APPWRITE_SERVER_API_KEY` hoặc `SESSION_SECRET` vào Git, Docker build args,
`NEXT_PUBLIC_*` hay log. Hai biến `APPWRITE_RESOLVE_HOST`/`APPWRITE_RESOLVE_IP` chỉ dùng cho tình
huống DNS tạm thời được mô tả trong `.env.example`; production chuẩn phải dùng DNS và HTTPS thật.

## 4. Kiểm tra sau deploy

```bash
curl -fsS https://boc.example.com/api/health
curl -fsS https://boc.example.com/api/ready
```

- `/api/health` trả HTTP 200: tiến trình Next.js còn sống.
- `/api/ready` trả HTTP 200 và `data_store.driver=appwrite`: app kết nối được kho dữ liệu.
- Mở trang đăng nhập, đăng nhập bằng một tài khoản Appwrite thật và kiểm tra một màn hình danh sách.
- Kiểm tra log không có secret, lỗi schema hay vòng lặp restart.

Healthcheck của image dùng `/api/ready`; container mới chỉ trở thành healthy khi Appwrite sẵn sàng.
Filesystem runtime đặt read-only, chỉ `/tmp` và cache Next.js là tmpfs. Vì vậy web app không cần
volume dữ liệu và mỗi lần deploy có thể thay container an toàn.

### Build đứng ở “Creating an optimized production build”

Bản deploy dùng Webpack với một worker, externalize các package server nặng và giới hạn heap compiler
768 MB để không làm nghẽn VPS. Docker BuildKit cũng cache `.next/cache` giữa các lần build. Không đổi
lệnh build trong Dokploy thành `next build` hoặc `next build --turbopack`; dùng nguyên Dockerfile.

Nếu log có `JavaScript heap out of memory`, tăng `NEXT_BUILD_MEMORY_MB` theo từng bước nhỏ
(`1024`, rồi `1280`) và kiểm tra RAM trống. Nếu không có lỗi OOM mà VPS vẫn lag, không tăng giới hạn;
hãy build image trên CI/registry rồi để Dokploy chỉ pull và chạy image.

## 5. Cập nhật và rollback

Mỗi bản phát hành nên dùng `IMAGE_TAG` và `NEXT_DEPLOYMENT_ID` bằng cùng Git SHA/release id. Không
dùng `latest` để rollback. Sau khi deploy, theo dõi readiness, HTTP 5xx và log ít nhất 30 phút.

Rollback bằng cách deploy lại commit/tag trước. Schema Appwrite không tự rollback; chỉ rollback
schema hoặc dữ liệu từ backup theo `docs/RUNBOOK.md` khi có kế hoạch và phê duyệt riêng.
