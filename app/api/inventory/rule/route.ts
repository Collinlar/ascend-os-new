// What the till does when a product runs out (Inventory Core I2, 0127):
// keep selling, warn, or stop at zero while online.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: { businessId?: string; itemId?: string; rule?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.businessId || !body.itemId || !["none", "soft", "hard"].includes(body.rule ?? "")) {
    return NextResponse.json({ error: "Pick what the till should do." }, { status: 422 });
  }
  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", body.businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  const { data, error } = await db.rpc("set_stock_rule", {
    p: { business_id: body.businessId, item_id: body.itemId, rule: body.rule, actor_membership_id: membership.id },
  });
  if (error) {
    if (/permission_denied/.test(error.message)) {
      return NextResponse.json({ error: "Only the owner or a manager can change this." }, { status: 403 });
    }
    if (/item_not_found/.test(error.message)) {
      return NextResponse.json({ error: "We could not find that product. Refresh and try again." }, { status: 404 });
    }
    return NextResponse.json({ error: "We could not save that just now. Tap again in a moment." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/rule", "POST", handlePOST);
