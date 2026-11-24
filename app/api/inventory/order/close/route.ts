// Nothing more is coming on this order (Advanced Inventory A2, 0132). An
// order that came short is closed; one where nothing came is cancelled.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { purchasingActor, purchasingError, readBody } from "@/lib/inventory/purchasing-route";

async function handlePOST(request: NextRequest) {
  const body = await readBody<{ businessId?: string; documentId?: string; note?: string }>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  if (!body.documentId) return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;

  const { data, error } = await supabaseServer().rpc("close_stock_order", {
    p: { business_id: body.businessId, document_id: body.documentId, closed_by: who.membershipId, note: body.note ?? "" },
  });
  if (error) return purchasingError(error, "We could not close that order just now. Tap again in a moment.");
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/order/close", "POST", handlePOST);
