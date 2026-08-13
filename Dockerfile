# syntax=docker/dockerfile:1

# =============================================================================
# BOC Control Tower — image production
# Guideline 18.2: multi-stage, cài bằng lockfile, build một lần, chạy non-root.
# =============================================================================

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencies ------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` bắt buộc: cài đúng phiên bản đã pin trong lockfile (ADR-015).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund

# --- Build -------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Giá trị build-time chỉ để Next.js dựng được trang; secret thật inject lúc chạy.
ENV NODE_ENV=production
ENV DATA_DRIVER=appwrite
ENV APPWRITE_ENDPOINT=https://build.invalid/v1
ENV APPWRITE_PROJECT_ID=build
ENV APPWRITE_SERVER_API_KEY=build
ENV SESSION_SECRET=build-time-placeholder-not-used-at-runtime

# Giới hạn heap của compiler. Với một worker, 768 MB đủ cho project này và tránh build nuốt toàn
# bộ RAM của VPS. Có thể tăng build arg khi ứng dụng lớn lên, nhưng không nên bỏ giới hạn trên host
# đang đồng thời chạy production workload.
ARG NEXT_BUILD_MEMORY_MB=768
ENV NODE_OPTIONS=--max-old-space-size=${NEXT_BUILD_MEMORY_MB}

# Dokploy có thể truyền Git SHA/release id vào build arg này để Next.js chống version skew.
ARG NEXT_DEPLOYMENT_ID

# Cache compiler giữa các lần deploy. Cache chỉ tăng tốc build, không được đưa vào runtime image.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# --- Runner ------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `output: standalone` gom sẵn runtime tối thiểu — image nhỏ, ít bề mặt tấn công.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next.js ghi cache ảnh/route vào đây. Compose sẽ mount tmpfs vào đúng đường dẫn này
# để phần còn lại của filesystem vẫn có thể đặt read-only.
RUN mkdir -p /app/.next/cache \
 && chown nextjs:nodejs /app/.next/cache

USER nextjs
EXPOSE 3000

# Readiness kiểm tra cả phụ thuộc Appwrite, không chỉ tiến trình còn sống.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
