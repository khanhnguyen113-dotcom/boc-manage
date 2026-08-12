import { NextResponse } from 'next/server';

import { publicRuntimeInfo } from '@/config/env';
import { getStore } from '@/server/db/store';

/**
 * Readiness — guideline 18.2: kiểm tra phụ thuộc thật (Appwrite/kho dữ liệu).
 * Trả 503 khi chưa sẵn sàng để load balancer không đẩy traffic vào.
 *
 * Payload cố tình chỉ chứa thông tin cấu hình **công khai** — không có endpoint, project id
 * hay API key.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();

  try {
    const store = await getStore();
    const ping = await store.ping();

    return NextResponse.json(
      {
        status: ping.ok ? 'ready' : 'degraded',
        data_store: { ok: ping.ok, driver: ping.driver, detail: ping.detail },
        latency_ms: Date.now() - started,
        runtime: publicRuntimeInfo(),
      },
      { status: ping.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', detail: (error as Error).message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
