// The owner and the customer on one booking (round 4, S2): a new private
// link to send the customer, and marking a deposit returned, which records
// a refund against the payment so Money follows.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";
import { bookingPath, createBookingLink } from "@/lib/services/booking-link";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest, { params }: { params: { id: string } }) {
  const personId = await currentPersonId();
  if (!personId) return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  let body: { action?: string; method?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const db = supabaseServer();
  const { data: booking } = await db.from("service_booking").select("id, business_id").eq("id", params.id).maybeSingle();
  if (!booking) return NextResponse.json({ error: "We could not find that booking." }, { status: 404 });
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", booking.business_id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  if (body.action === "share_link") {
    try {
      const token = await createBookingLink(booking.id as string, booking.business_id as string);
      return NextResponse.json({ path: bookingPath(token) });
    } catch {
      return NextResponse.json({ error: "Booking links switch on after this week's update." }, { status: 503 });
    }
  }

  if (body.action === "return_deposit") {
    const { data, error } = await db.rpc("return_booking_deposit", {
      p: { business_id: booking.business_id, actor_membership_id: membership.id, booking_id: booking.id, method: body.method ?? "mobile_money" },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      if (/already_returned/.test(error.message)) return NextResponse.json({ error: "This deposit is already marked returned." }, { status: 409 });
      if (/nothing_to_return/.test(error.message)) return NextResponse.json({ error: "There is no deposit to return on this booking." }, { status: 409 });
      return NextResponse.json({ error: "That did not save. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "We could not tell what to do. Refresh and tap again." }, { status: 422 });
}

export const POST = withAuthority("services/bookings/[id]/customer", "POST", handlePOST);
