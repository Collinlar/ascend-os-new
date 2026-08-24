// Relay trigger. Vercel cron calls this every five minutes; it can also be
// invoked manually during operations work. Guarded by CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { processOutboxBatch } from "@/lib/relay";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "not authorized" }, { status: 401 });
  }
  try {
    const result = await processOutboxBatch(50);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "relay error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
