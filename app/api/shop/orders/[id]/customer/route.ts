// The owner and the customer on one order (round 2, R5): a new private link
// to send the customer, and a reply to their report, which may close it.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";
import { createOrderLink, orderPath } from "@/lib/shop/tracking";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest, { params }: { params: { id: string } }) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: { action?: string; reportId?: string; reply?: string; sorted?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const db = supabaseServer();
  const { data: order } = await db.from("shop_order").select("id, business_id").eq("id", params.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "We could not find that order." }, { status: 404 });
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", order.business_id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  if (body.action === "share_link") {
    try {
      const token = await createOrderLink(order.id as string, order.business_id as string);
      return NextResponse.json({ path: orderPath(token) });
    } catch {
      return NextResponse.json({ error: "We could not make the link just now. Tap again in a moment." }, { status: 500 });
    }
  }

  if (body.action === "reply") {
    if (!body.reportId || !/^[0-9a-f-]{36}$/i.test(body.reportId)) {
      return NextResponse.json({ error: "We could not tell which report. Refresh and tap again." }, { status: 422 });
    }
    const { data: report } = await db.from("customer_report").select("id").eq("id", body.reportId).eq("shop_order_id", order.id).maybeSingle();
    if (!report) return NextResponse.json({ error: "That report is not on this order." }, { status: 404 });
    const { data, error } = await db.rpc("reply_customer_report", {
      p: {
        business_id: order.business_id,
        report_id: body.reportId,
        actor_membership_id: membership.id,
        reply: body.reply ?? "",
        sorted: body.sorted === true,
      },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      if (/reply_needed/.test(error.message)) {
        return NextResponse.json({ error: "Write the customer a line, so they know what you did." }, { status: 422 });
      }
      if (/report_not_with_shop/.test(error.message)) {
        return NextResponse.json({ error: "Ascend is reviewing this report now, so it can no longer be closed here." }, { status: 409 });
      }
      return NextResponse.json({ error: "That did not go through. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: (data as { status: string }).status });
  }

  return NextResponse.json({ error: "We could not tell what to do. Refresh and tap again." }, { status: 422 });
}

export const POST = withAuthority("shop/orders/[id]/customer", "POST", handlePOST);
