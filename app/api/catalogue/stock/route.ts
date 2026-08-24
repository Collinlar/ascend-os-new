// Stock arriving, stock lost, and stock counted.
//
// Every one of these is a movement, never an overwrite, so the shelf figure
// stays explainable: an owner can always see what changed it and when
// (POS-INV-012).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

type Kind = "opening_balance" | "restock" | "damage_loss" | "count_correction";

const KINDS: Kind[] = ["opening_balance", "restock", "damage_loss", "count_correction"];

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: {
    businessId?: string;
    locationId?: string;
    itemId?: string;
    kind?: Kind;
    quantity?: number | string;
    countedQuantity?: number | string;
    unitCost?: number | string;
    reason?: string;
    clientRef?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap save again." }, { status: 400 });
  }

  if (!body.businessId || !body.locationId || !body.itemId) {
    return NextResponse.json({ error: "Pick which product this is for." }, { status: 422 });
  }
  if (!body.kind || !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "Say what happened to this stock." }, { status: 422 });
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
    return NextResponse.json(
      { error: "Only the owner or a manager can change stock." },
      { status: 403 }
    );
  }

  const { data, error } = await db.rpc("record_stock_movement", {
    p: {
      business_id: body.businessId,
      location_id: body.locationId,
      item_id: body.itemId,
      kind: body.kind,
      quantity: body.quantity === undefined ? null : String(body.quantity),
      counted_quantity:
        body.countedQuantity === undefined ? null : String(body.countedQuantity),
      unit_cost: body.unitCost === undefined ? "" : String(body.unitCost),
      reason: body.reason ?? "",
      actor_membership_id: membership.id,
      // Idempotent, so a merchant tapping twice on a bad connection does
      // not count the same delivery in twice.
      client_ref: body.clientRef ?? "",
    },
  });

  if (error) {
    if (/reason_required/.test(error.message)) {
      return NextResponse.json(
        { error: "Say what happened. This is the note that explains a missing item later." },
        { status: 422 }
      );
    }
    if (/counted_quantity_required/.test(error.message)) {
      return NextResponse.json({ error: "Enter what you actually counted." }, { status: 422 });
    }
    if (/quantity_required/.test(error.message)) {
      return NextResponse.json({ error: "Enter how many." }, { status: 422 });
    }
    if (/item_not_found/.test(error.message)) {
      return NextResponse.json({ error: "We could not find that product." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "We could not save that just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? { saved: true });
}
