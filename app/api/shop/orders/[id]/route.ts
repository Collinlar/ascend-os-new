// Owner order actions (SHP-010). Session-guarded and membership-scoped;
// the transition itself is validated and applied atomically in the database
// so no client can move an order into a state the workflow forbids.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

const ALLOWED_TARGETS = [
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "fulfilled",
  "cancelled",
  "refunded",
] as const;

type Target = (typeof ALLOWED_TARGETS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { toStatus?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap again." },
      { status: 400 }
    );
  }

  const toStatus = body.toStatus as Target;
  if (!ALLOWED_TARGETS.includes(toStatus)) {
    return NextResponse.json({ error: "That is not an order action." }, { status: 422 });
  }

  const db = supabaseServer();

  const { data: order } = await db
    .from("shop_order")
    .select("id, business_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "We could not find that order." }, { status: 404 });
  }

  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", order.business_id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to this business." },
      { status: 403 }
    );
  }

  const { data, error } = await db.rpc("advance_shop_order", {
    p: {
      order_id: order.id,
      to_status: toStatus,
      actor_membership_id: membership.id,
      reason: body.reason ?? null,
    },
  });

  if (error) {
    if (/illegal transition/.test(error.message)) {
      return NextResponse.json(
        { error: "This order has already moved on. Refresh to see where it is." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We could not update this order just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: data.status, unchanged: data.unchanged });
}
