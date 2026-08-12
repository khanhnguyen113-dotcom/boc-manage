import { NextResponse } from 'next/server';

/**
 * Liveness — guideline 18.2: chỉ trả lời “tiến trình còn sống”, KHÔNG chạm database.
 * Nếu endpoint này phụ thuộc Appwrite thì một sự cố database sẽ khiến orchestrator restart
 * container vô ích.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok', uptime_seconds: Math.round(process.uptime()) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
