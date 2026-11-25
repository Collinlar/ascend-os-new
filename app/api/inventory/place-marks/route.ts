// Set a product's low mark place by place (Advanced Inventory A4, 0135). A
// place sent with no figure goes back to the product's own mark.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { purchasingActor, purchasingError, readBody } from "@/lib/inventory/purchasing-route";

type Body = { businessId?: string; itemId?: string; marks?: { locationId?: string; lowAt?: number | string | null }[] };

async function handlePOST(request: NextRequest) {
  const body = await readBody<Body>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  if (!body.itemId || !Array.isArray(body.marks)) return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;

  const { data, error } = await supabaseServer().rpc("set_place_low_marks", {
    p: {
      business_id: body.businessId,
      actor_membership_id: who.membershipId,
      item_id: body.itemId,
      marks: body.marks.map((m) => ({ location_id: m.locationId, low_at: m.lowAt === undefined || m.lowAt === null ? "" : String(m.lowAt) })),
    },
  });
  if (error) {
    if (/low_at_invalid/.test(error.message)) return NextResponse.json({ error: "A low mark cannot be below zero." }, { status: 422 });
    return purchasingError(error, "We could not save those marks just now. Tap again in a moment.");
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/place-marks", "POST", handlePOST);
