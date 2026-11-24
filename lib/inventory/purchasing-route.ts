// Shared by the purchasing routes (Advanced Inventory A2, 0132): who is
// asking, and the database's refusals in words a shop owner can act on.

import { NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { deniedByDatabase } from "@/lib/authority/denied";

const SAY: [RegExp, string, number][] = [
  [/not_entitled/, "Suppliers and stock orders come with Advanced Inventory. Talk to us to switch it on.", 403],
  [/supplier_exists/, "You already have a supplier with that name. Pick them from the list.", 409],
  [/supplier_not_found/, "We could not find that supplier. Refresh and try again.", 404],
  [/supplier_required/, "Say who you are ordering from.", 422],
  [/name_required/, "What is the supplier called?", 422],
  [/name_too_long/, "Keep the supplier's name under 120 letters.", 422],
  [/location_not_found/, "We could not find that place. Refresh and try again.", 404],
  [/item_not_found/, "One of those products is not in your list any more. Refresh and try again.", 404],
  [/item_ordered_twice/, "A product is on two lines. Put it on one line with the full number.", 422],
  [/quantity_required/, "Say how many of each product you are ordering.", 422],
  [/cost_invalid/, "A cost cannot be below zero.", 422],
  [/lines_required/, "Add at least one product to the order.", 422],
  [/too_many_lines/, "That is more than 200 products. Split it into two orders.", 422],
  [/order_not_found/, "We could not find that order. Refresh and try again.", 404],
  [/receipt_not_found/, "We could not find that delivery. Refresh and try again.", 404],
  [/payment_method_required/, "Say how you paid: cash, MoMo, bank or card.", 422],
  [/cost_required_when_paid/, "That delivery has no cost on it, so there is nothing to pay here.", 422],
];

export async function purchasingActor(businessId: string | undefined) {
  const personId = await currentPersonId();
  if (!personId) {
    return { error: NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 }) };
  }
  if (!businessId) return { error: NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 }) };
  const { data } = await supabaseServer()
    .from("business_membership")
    .select("id")
    .eq("business_id", businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "You do not have access to this business." }, { status: 403 }) };
  return { membershipId: data.id as string };
}

export function purchasingError(error: { message: string; code?: string }, fallback: string) {
  const denied = deniedByDatabase(error);
  if (denied) return denied;
  const hit = SAY.find(([re]) => re.test(error.message));
  if (hit) return NextResponse.json({ error: hit[1] }, { status: hit[2] });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
