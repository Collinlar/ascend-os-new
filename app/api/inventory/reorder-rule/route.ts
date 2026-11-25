// Set a product's reorder rule (Advanced Inventory A3, 0133): its low mark,
// how many to order, and who from.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { purchasingActor, purchasingError, readBody } from "@/lib/inventory/purchasing-route";

type Body = { businessId?: string; itemId?: string; lowAt?: number | string | null; reorderQuantity?: number | string | null; supplierId?: string | null };

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));

async function handlePOST(request: NextRequest) {
  const body = await readBody<Body>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  if (!body.itemId) return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;

  const { data, error } = await supabaseServer().rpc("set_reorder_rule", {
    p: {
      business_id: body.businessId,
      actor_membership_id: who.membershipId,
      item_id: body.itemId,
      low_at: text(body.lowAt),
      reorder_quantity: text(body.reorderQuantity),
      supplier_id: text(body.supplierId),
    },
  });
  if (error) {
    if (/low_at_required/.test(error.message)) return NextResponse.json({ error: "Say how low it gets before you reorder." }, { status: 422 });
    if (/low_at_invalid/.test(error.message)) return NextResponse.json({ error: "The low mark cannot be below zero." }, { status: 422 });
    if (/reorder_quantity_invalid/.test(error.message)) return NextResponse.json({ error: "Order at least one, or leave how many empty." }, { status: 422 });
    return purchasingError(error, "We could not save that rule just now. Tap again in a moment.");
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/reorder-rule", "POST", handlePOST);
