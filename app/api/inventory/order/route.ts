// Order stock from a supplier (Advanced Inventory A2, 0132). The order is
// an issued purchase order document; nothing moves on the shelf or in the
// money until the goods arrive.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { purchasingActor, purchasingError, readBody } from "@/lib/inventory/purchasing-route";

type Body = {
  businessId?: string;
  locationId?: string;
  clientRef?: string;
  supplierId?: string;
  supplierName?: string;
  expectedOn?: string;
  note?: string;
  lines?: { itemId?: string; quantity?: number | string; unitCost?: number | string | null }[];
};

async function handlePOST(request: NextRequest) {
  const body = await readBody<Body>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  if (!body.locationId || !body.clientRef) return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;
  if (body.expectedOn && !/^\d{4}-\d{2}-\d{2}$/.test(body.expectedOn)) {
    return NextResponse.json({ error: "Pick the day you expect it from the calendar." }, { status: 422 });
  }

  const { data, error } = await supabaseServer().rpc("place_stock_order", {
    p: {
      business_id: body.businessId,
      client_ref: body.clientRef,
      ordered_by: who.membershipId,
      location_id: body.locationId,
      supplier_id: body.supplierId ?? "",
      supplier_name: body.supplierName ?? "",
      expected_on: body.expectedOn ?? "",
      note: body.note ?? "",
      lines: (body.lines ?? []).map((l) => ({
        item_id: l.itemId,
        quantity: l.quantity === undefined || l.quantity === "" ? null : String(l.quantity),
        unit_cost: l.unitCost === undefined || l.unitCost === null || l.unitCost === "" ? "" : String(l.unitCost),
      })),
    },
  });
  if (error) return purchasingError(error, "We could not place that order just now. Your lines are still here. Tap again.");
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/order", "POST", handlePOST);
