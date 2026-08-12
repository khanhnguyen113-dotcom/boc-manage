/**
 * Stub cho `server-only` khi chạy script CLI bằng tsx.
 *
 * Package thật cố tình ném lỗi khi bị nạp ngoài môi trường server của Next; script bootstrap /
 * seed / import chạy trực tiếp trên Node nên cần bản rỗng. Trong ứng dụng Next, alias này
 * **không** được dùng — `tsconfig.json` giữ nguyên package thật để bảo vệ ranh giới client/server.
 */
export {};
