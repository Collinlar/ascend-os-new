// "Still not sorted": the customer sends their report on to Ascend before
// the 48 hours are up (round 2, R5). Only from the order's own link.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { lookUpOrderLink } from "@/lib/shop/tracking";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  let body: { token?: string; reportId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.reportId || !/^[0-9a-f-]{36}$/i.test(body.reportId)) {
    return NextResponse.json({ error: "We could not tell which report. Refresh the page and tap again." }, { status: 422 });
  }
  const link = await lookUpOrderLink(body.token ?? "");
  if (link.state === "unreachable") {
    return NextResponse.json({ error: "We could not reach Ascend just now. Tap again in a moment." }, { status: 503 });
  }
  if (link.state !== "ready") {
    return NextResponse.json({ error: "This order link has expired. Ask the shop to send you a new one." }, { status: 404 });
  }
  const { data, error } = await supabaseServer().rpc("escalate_customer_report", {
    p: { report_id: body.reportId, shop_order_id: link.orderId },
  });
  if (error) {
    return NextResponse.json(
      { error: /report_not_found/.test(error.message) ? "We could not find that report on this order." : "That did not go through. Tap again in a moment." },
      { status: /report_not_found/.test(error.message) ? 404 : 500 }
    );
  }
  return NextResponse.json({ ok: true, status: (data as { status: string }).status });
}

export const POST = withAuthority("order-link/escalate", "POST", handlePOST);
