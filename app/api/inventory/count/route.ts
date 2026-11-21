// Send a stock count (Inventory Core I4, 0129). Any member of the business
// may count; whether it posts at once or waits is the database's decision.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

const SAY: [RegExp, string, number][] = [
  [/item_not_found/, "One of those products is not in your list any more. Refresh and count again.", 404],
  [/location_not_found/, "We could not find that place. Refresh and try again.", 404],
  [/counted_required/, "Every product needs a count. Zero is fine if the shelf is empty.", 422],
  [/item_counted_twice/, "A product is in this count twice. Refresh and try again.", 422],
  [/lines_required/, "Count at least one product.", 422],
  [/too_many_lines/, "That is more than 500 products. Count them in two sittings.", 422],
  [/counter_not_member/, "You are not on this business's team any more.", 403],
];

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: { businessId?: string; locationId?: string; clientRef?: string; note?: string; lines?: { itemId?: string; counted?: number | string; reason?: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap send again." }, { status: 400 });
  }
  if (!body.businessId || !body.locationId || !body.clientRef) {
    return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
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

  const { data, error } = await db.rpc("submit_stock_count", {
    p: {
      business_id: body.businessId,
      location_id: body.locationId,
      client_ref: body.clientRef,
      counted_by: membership.id,
      note: body.note ?? "",
      lines: (body.lines ?? []).map((l) => ({ item_id: l.itemId, counted: l.counted === undefined || l.counted === "" ? null : String(l.counted), reason: l.reason ?? "" })),
    },
  });
  if (error) {
    const hit = SAY.find(([re]) => re.test(error.message));
    if (hit) return NextResponse.json({ error: hit[1] }, { status: hit[2] });
    return NextResponse.json({ error: "We could not save your count just now. Your numbers are still here. Tap send again." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/count", "POST", handlePOST);
