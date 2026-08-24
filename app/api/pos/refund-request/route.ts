// A cashier raising a refund from the till. Device-authenticated, and
// deliberately only a request: the reversal happens when someone with
// authority approves it (POS-009, POS-017, IDN-016).

import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const device = await authenticateDevice(request);
  if (!device) {
    return NextResponse.json(
      { error: "This till is no longer active. Ask the owner to set it up again." },
      { status: 401 }
    );
  }

  let body: { saleId?: string; reason?: string; cashierMembershipId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap again." },
      { status: 400 }
    );
  }

  if (!body.saleId) {
    return NextResponse.json({ error: "Pick which sale to refund." }, { status: 422 });
  }
  if (!(body.reason ?? "").trim()) {
    return NextResponse.json(
      { error: "Say why. The owner sees this when they decide." },
      { status: 422 }
    );
  }

  const db = supabaseServer();

  // The sale must belong to the till's own business.
  const { data: sale } = await db
    .from("sale")
    .select("id, business_id")
    .eq("id", body.saleId)
    .maybeSingle();
  if (!sale || sale.business_id !== device.businessId) {
    return NextResponse.json({ error: "We could not find that sale." }, { status: 404 });
  }

  const { data, error } = await db.rpc("request_sale_refund", {
    p: {
      sale_id: sale.id,
      reason: body.reason,
      requested_by: body.cashierMembershipId ?? "",
    },
  });

  if (error) {
    if (/sale_not_refundable/.test(error.message)) {
      return NextResponse.json(
        { error: "That sale has already been reversed." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We could not send the request. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    approvalId: data.approval_id,
    duplicate: data.duplicate,
    note: data.duplicate
      ? "This refund is already waiting for a decision."
      : "Sent. The owner decides, and the customer gets their money once it is approved.",
  });
}
