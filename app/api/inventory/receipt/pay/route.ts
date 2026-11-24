// Pay for a delivery that came on credit (Advanced Inventory A2, 0132).
// Records the money out once, under Stock and goods for resale.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { purchasingActor, purchasingError, readBody } from "@/lib/inventory/purchasing-route";

async function handlePOST(request: NextRequest) {
  const body = await readBody<{ businessId?: string; receiptId?: string; paymentMethod?: string }>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  if (!body.receiptId) return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;

  const { data, error } = await supabaseServer().rpc("pay_stock_receipt", {
    p: { business_id: body.businessId, receipt_id: body.receiptId, actor_membership_id: who.membershipId, payment_method: body.paymentMethod ?? "" },
  });
  if (error) return purchasingError(error, "We could not record that payment just now. Tap again in a moment.");
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/receipt/pay", "POST", handlePOST);
