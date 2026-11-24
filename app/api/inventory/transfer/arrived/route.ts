// Say what arrived from another place (Advanced Inventory A1, 0131). Anyone
// on the team may receive; the person receiving is not shown how many were
// sent, and whatever did not arrive is written off as lost on the way.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

const SAY: [RegExp, string, number][] = [
  [/transfer_not_found/, "We could not find those goods. Refresh and try again.", 404],
  [/received_more_than_sent/, "That is more than was sent. Count again, or ask whoever sent it to check.", 422],
  [/received_required/, "Say how many of each product arrived. Zero is fine if none came.", 422],
  [/receiver_not_member/, "You are not on this business's team any more.", 403],
];

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: { businessId?: string; locationId?: string; transferId?: string; note?: string; lines?: { itemId?: string; received?: number | string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.businessId || !body.transferId || !body.locationId) {
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

  // The wrapper checks the place in the body against the person's places;
  // here it must also be where the goods are going.
  const { data: t } = await db.from("stock_transfer").select("to_location_id").eq("id", body.transferId).eq("business_id", body.businessId).maybeSingle();
  if (!t) return NextResponse.json({ error: "We could not find those goods. Refresh and try again." }, { status: 404 });
  if (t.to_location_id !== body.locationId) {
    return NextResponse.json({ error: "These goods are going to another place. Someone there receives them." }, { status: 403 });
  }

  const { data, error } = await db.rpc("receive_stock_transfer", {
    p: {
      business_id: body.businessId,
      transfer_id: body.transferId,
      received_by: membership.id,
      note: body.note ?? "",
      lines: (body.lines ?? []).map((l) => ({ item_id: l.itemId, received: l.received === undefined || l.received === "" ? null : String(l.received) })),
    },
  });
  if (error) {
    const hit = SAY.find(([re]) => re.test(error.message));
    if (hit) return NextResponse.json({ error: hit[1] }, { status: hit[2] });
    return NextResponse.json({ error: "We could not save what arrived just now. Your numbers are still here. Tap again." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/transfer/arrived", "POST", handlePOST);
