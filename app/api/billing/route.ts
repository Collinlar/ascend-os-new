// Plans and billing (round 3, P4): ask Ascend for something or a top-up,
// cancel what was asked for, or hide a suggestion. Paying in the app waits
// for Paystack; an order is paid by transfer and recorded by Ascend.

import { NextRequest, NextResponse } from "next/server";
import { deniedByDatabase } from "@/lib/authority/denied";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  action?: "request" | "cancel" | "dismiss";
  businessId?: string;
  sku?: string;
  topUp?: number;
  orderId?: string;
  key?: string;
}

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const membership = await activeMembership<{ id: string; business_id: string }>(personId, "id, business_id");
  if (!membership || membership.business_id !== body.businessId) {
    return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });
  }
  const db = supabaseServer();
  const business = membership.business_id;

  if (body.action === "dismiss") {
    const key = (body.key ?? "").trim();
    if (!/^[a-z0-9_:-]{2,80}$/.test(key)) return NextResponse.json({ error: "We could not tell which suggestion." }, { status: 422 });
    const { error } = await db
      .from("billing_suggestion_dismissal")
      .upsert({ business_id: business, suggestion_key: key, dismissed_by: membership.id }, { onConflict: "business_id,suggestion_key" });
    if (error) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 500 });
    return NextResponse.json({ dismissed: true });
  }

  if (body.action === "request") {
    const { data, error } = await db.rpc("request_ascend_order", {
      p: {
        business_id: business,
        actor_membership_id: membership.id,
        sku: body.sku ?? "",
        top_up_amount: body.sku ? "" : String(Number(body.topUp) || ""),
      },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      const said: Array<[RegExp, string, number]> = [
        [/top_up_out_of_range/, "A top-up is between GHS 20 and GHS 20,000.", 422],
        [/not_for_sale_here/, "This is arranged with Ascend, not bought here. Ask Ascend on WhatsApp.", 409],
        [/not_in_the_price_book/, "That is not offered for your country right now.", 404],
        [/function .* does not exist|Could not find the function/, "Buying switches on after this week's update.", 503],
      ];
      const hit = said.find(([re]) => re.test(error.message));
      return NextResponse.json({ error: hit?.[1] ?? "That did not go through. Tap again." }, { status: hit?.[2] ?? 500 });
    }
    return NextResponse.json(data);
  }

  if (body.action === "cancel") {
    if (!body.orderId) return NextResponse.json({ error: "We could not tell which order." }, { status: 422 });
    const { error } = await db.rpc("cancel_ascend_order", { p: { business_id: business, actor_membership_id: membership.id, order_id: body.orderId } });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      if (/order_not_waiting/.test(error.message)) return NextResponse.json({ error: "Ascend already recorded this payment, so it cannot be cancelled here." }, { status: 409 });
      if (/order_not_found/.test(error.message)) return NextResponse.json({ error: "We could not find that order." }, { status: 404 });
      return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 500 });
    }
    return NextResponse.json({ cancelled: true });
  }

  return NextResponse.json({ error: "We could not tell what to do." }, { status: 422 });
}

export const POST = withAuthority("billing", "POST", handlePOST);
