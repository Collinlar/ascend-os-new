// The customer's own booking, through their private link (round 4, S2):
// move it, cancel it, or rate the visit. The link is the only key; the
// database checks the window, the time and the state again.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { lookUpBookingLink } from "@/lib/services/booking-link";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  let body: { token?: string; action?: string; newStart?: string; reason?: string; stars?: number; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const link = await lookUpBookingLink(body.token ?? "");
  if (link.state === "unreachable") return NextResponse.json({ error: "We could not reach the business just now. Tap again in a moment." }, { status: 503 });
  if (link.state !== "ready") return NextResponse.json({ error: "This booking link has expired. Ask the business for a new one." }, { status: 404 });
  const db = supabaseServer();

  if (body.action === "reschedule" || body.action === "cancel") {
    const { data, error } = await db.rpc("customer_change_booking", {
      p: { booking_id: link.bookingId, action: body.action, new_start: body.newStart ?? "", reason: (body.reason ?? "").slice(0, 200) },
    });
    if (error) {
      const said: Array<[RegExp, string, number]> = [
        [/outside_window: (\d+)/, "It is too close to your booking to change it here. Message the business on WhatsApp.", 409],
        [/new_time_too_soon/, "That time is too soon to move to here. Pick a later one.", 409],
        [/slot_unavailable|slot_taken/, "That time is not free any more. Pick another.", 409],
        [/booking_not_changeable/, "This booking can no longer be changed here.", 409],
        [/new_time_needed/, "Pick a new time first.", 422],
      ];
      const hit = said.find(([re]) => re.test(error.message));
      return NextResponse.json({ error: hit?.[1] ?? "That did not go through. Tap again in a moment." }, { status: hit?.[2] ?? 500 });
    }
    return NextResponse.json(data);
  }

  // Round 4, S3: the customer accepts their quotation.
  if (body.action === "accept") {
    const { data, error } = await db.rpc("accept_booking_quotation", { p: { booking_id: link.bookingId } });
    if (error) {
      if (/quotation_expired/.test(error.message)) return NextResponse.json({ error: "This quotation has expired. Message the business for a new one." }, { status: 409 });
      if (/no_quotation_to_accept|quotation_not_open/.test(error.message)) return NextResponse.json({ error: "There is no open quotation to accept here." }, { status: 409 });
      return NextResponse.json({ error: "That did not go through. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (body.action === "rate") {
    const { error } = await db.rpc("rate_booking", { p: { booking_id: link.bookingId, stars: Number(body.stars), comment: body.comment ?? "" } });
    if (error) {
      if (/already_rated/.test(error.message)) return NextResponse.json({ error: "You have already rated this visit. Thank you." }, { status: 409 });
      if (/not_done_yet/.test(error.message)) return NextResponse.json({ error: "You can rate your visit once it is done." }, { status: 409 });
      if (/stars_1_to_5/.test(error.message)) return NextResponse.json({ error: "Tap 1 to 5 stars." }, { status: 422 });
      return NextResponse.json({ error: "That did not go through. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json({ rated: true });
  }

  return NextResponse.json({ error: "We could not tell what to do." }, { status: 422 });
}

export const POST = withAuthority("booking-link", "POST", handlePOST);
