// Expiry dates and batches (Advanced Inventory A5, 0137): switch a product
// on or off ("track"), or write off what is left of an expired batch
// ("write_off"). Owners and managers.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { purchasingActor, readBody } from "@/lib/inventory/purchasing-route";
import { deniedByDatabase } from "@/lib/authority/denied";

type Body = { businessId?: string; action?: string; itemId?: string; on?: boolean; batchId?: string; note?: string };

async function handlePOST(request: NextRequest) {
  const body = await readBody<Body>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;
  const db = supabaseServer();

  const { data, error } =
    body.action === "track" && body.itemId
      ? await db.rpc("set_expiry_tracking", { p: { business_id: body.businessId, actor_membership_id: who.membershipId, item_id: body.itemId, on: body.on === true } })
      : body.action === "write_off" && body.batchId
        ? await db.rpc("write_off_expired", { p: { business_id: body.businessId, actor_membership_id: who.membershipId, batch_id: body.batchId, note: body.note ?? "" } })
        : { data: null, error: { message: "bad_request" } };

  if (error) {
    const denied = deniedByDatabase(error);
    if (denied) return denied;
    if (/bad_request/.test(error.message)) return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
    if (/not_entitled/.test(error.message)) return NextResponse.json({ error: "Expiry dates come with Advanced Inventory. Talk to us to switch it on." }, { status: 403 });
    if (/item_not_found|batch_not_found/.test(error.message)) return NextResponse.json({ error: "We could not find that. Refresh and try again." }, { status: 404 });
    return NextResponse.json({ error: "We could not save that just now. Tap again in a moment." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/expiry", "POST", handlePOST);
