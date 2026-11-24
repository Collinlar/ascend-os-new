// Send stock from one place to another (Advanced Inventory A1, 0131).
// Owners and managers only; the goods leave the first place at once and
// arrive when someone at the other place says what came.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";

const SAY: [RegExp, string, number][] = [
  [/not_entitled/, "Moving stock between places comes with Advanced Inventory. Talk to us to switch it on.", 403],
  [/same_place/, "Pick two different places: where it leaves from, and where it is going.", 422],
  [/location_not_found/, "We could not find one of those places. Refresh and try again.", 404],
  [/item_not_found/, "One of those products is not in your list any more. Refresh and try again.", 404],
  [/quantity_required/, "Say how many of each product you are sending.", 422],
  [/item_sent_twice/, "A product is on two lines. Put it on one line with the full number.", 422],
  [/lines_required/, "Add at least one product to send.", 422],
  [/too_many_lines/, "That is more than 500 products. Send them in two goes.", 422],
];

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: {
    businessId?: string;
    locationId?: string;
    toLocationId?: string;
    clientRef?: string;
    note?: string;
    arrived?: boolean;
    lines?: { itemId?: string; quantity?: number | string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap send again." }, { status: 400 });
  }
  if (!body.businessId || !body.locationId || !body.toLocationId || !body.clientRef) {
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

  const { data, error } = await db.rpc("send_stock_transfer", {
    p: {
      business_id: body.businessId,
      from_location_id: body.locationId,
      to_location_id: body.toLocationId,
      client_ref: body.clientRef,
      sent_by: membership.id,
      note: body.note ?? "",
      arrived: body.arrived === true,
      lines: (body.lines ?? []).map((l) => ({ item_id: l.itemId, quantity: l.quantity === undefined || l.quantity === "" ? null : String(l.quantity) })),
    },
  });
  if (error) {
    const denied = deniedByDatabase(error);
    if (denied) return denied;
    const hit = SAY.find(([re]) => re.test(error.message));
    if (hit) return NextResponse.json({ error: hit[1] }, { status: hit[2] });
    return NextResponse.json({ error: "We could not send that just now. Nothing has moved. Tap send again." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/transfer", "POST", handlePOST);
