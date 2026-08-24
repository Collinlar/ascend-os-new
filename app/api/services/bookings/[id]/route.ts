// Provider-side booking actions: accept, quote, start, complete, cancel,
// mark a no-show. Session-guarded and membership-scoped; the legal
// transitions are enforced in the database.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

const TARGETS = [
  "quoted",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

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

  let body: { toStatus?: string; reason?: string; priceQuoted?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const toStatus = body.toStatus as (typeof TARGETS)[number];
  if (!TARGETS.includes(toStatus)) {
    return NextResponse.json({ error: "That is not a booking action." }, { status: 422 });
  }

  const db = supabaseServer();
  const { data: booking } = await db
    .from("service_booking")
    .select("id, business_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "We could not find that booking." }, { status: 404 });
  }

  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", booking.business_id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to this business." },
      { status: 403 }
    );
  }

  const { data, error } = await db.rpc("advance_booking", {
    p: {
      booking_id: booking.id,
      to_status: toStatus,
      actor_membership_id: membership.id,
      reason: body.reason ?? null,
      price_quoted: body.priceQuoted ?? "",
    },
  });

  if (error) {
    if (/slot_taken/.test(error.message)) {
      return NextResponse.json(
        { error: "That time now clashes with another booking. Reschedule it first." },
        { status: 409 }
      );
    }
    if (/illegal transition/.test(error.message)) {
      return NextResponse.json(
        { error: "This booking has already moved on. Refresh to see where it is." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We could not update this booking just now. Tap again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: data.status, unchanged: data.unchanged });
}
