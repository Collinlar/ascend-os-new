// Goods in from a supplier (Inventory Core I1, 0125): one receipt, many
// lines, each with an optional cost. Paid receipts record the money out
// under "Stock and goods for resale" in the same step.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

const METHODS = ["cash", "mobile_money", "bank_transfer", "card"] as const;

const SAY: [RegExp, string, number][] = [
  [/cost_required_when_paid/, "Add what you paid for at least one line, so we know how much money went out.", 422],
  [/payment_method_required|payment_method_invalid/, "Say how you paid: cash, MoMo, bank or card.", 422],
  [/item_not_found/, "One of those products is not in your list any more. Refresh and try again.", 404],
  [/location_not_found/, "We could not find that place. Refresh and try again.", 404],
  [/quantity_required/, "Every line needs how many came in.", 422],
  [/cost_invalid/, "A cost cannot be below zero.", 422],
  [/lines_required/, "Add at least one product that came in.", 422],
  [/too_many_lines/, "That is more than 200 lines. Split it into two deliveries.", 422],
  [/order_not_found/, "We could not find that order. Refresh and try again.", 404],
  [/order_not_open/, "That order is already received or closed. Receive this delivery without it.", 409],
  [/order_other_place/, "That order is for another place. Pick the place it was going to.", 422],
  [/expiry_invalid/, "One of the expiry dates is not a date. Pick it from the calendar.", 422],
];

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: {
    businessId?: string;
    locationId?: string;
    supplierName?: string;
    reference?: string;
    paid?: boolean;
    paymentMethod?: string;
    clientRef?: string;
    purchaseOrderId?: string;
    lines?: { itemId?: string; quantity?: number | string; unitCost?: number | string | null; expiresOn?: string; batchCode?: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap save again." }, { status: 400 });
  }
  if (!body.businessId || !body.locationId || !body.clientRef) {
    return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  }
  if (body.paid && !METHODS.includes(body.paymentMethod as (typeof METHODS)[number])) {
    return NextResponse.json({ error: "Say how you paid: cash, MoMo, bank or card." }, { status: 422 });
  }

  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id, role:role_id(key)")
    .eq("business_id", body.businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  const roleKey = (membership?.role as unknown as { key: string } | null)?.key;
  if (!membership || (roleKey !== "owner" && roleKey !== "manager")) {
    return NextResponse.json({ error: "Only the owner or a manager can receive stock." }, { status: 403 });
  }

  const { data, error } = await db.rpc("receive_stock", {
    p: {
      business_id: body.businessId,
      location_id: body.locationId,
      actor_membership_id: membership.id,
      client_ref: body.clientRef,
      supplier_name: body.supplierName ?? "",
      reference: body.reference ?? "",
      paid: Boolean(body.paid),
      payment_method: body.paid ? body.paymentMethod : "",
      purchase_order_id: body.purchaseOrderId ?? "",
      lines: (body.lines ?? []).map((l) => ({
        item_id: l.itemId,
        quantity: l.quantity === undefined ? null : String(l.quantity),
        unit_cost: l.unitCost === undefined || l.unitCost === null || l.unitCost === "" ? "" : String(l.unitCost),
        expires_on: l.expiresOn ?? "",
        batch_code: l.batchCode ?? "",
      })),
    },
  });
  if (error) {
    const hit = SAY.find(([re]) => re.test(error.message));
    if (hit) return NextResponse.json({ error: hit[1] }, { status: hit[2] });
    return NextResponse.json({ error: "We could not save that delivery just now. Tap again in a moment." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/receive", "POST", handlePOST);
