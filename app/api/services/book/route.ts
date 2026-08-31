// Public booking from Customer Web. No account, no download (SRV-005).
// The slot is held by a database exclusion constraint, so a customer who
// loses a race is told plainly rather than silently double-booked.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { normalizePhone } from "@/lib/auth/phone";

interface Body {
  slug?: string;
  clientRef?: string;
  itemId?: string;
  membershipId?: string;
  scheduledStart?: string;
  customerName?: string;
  customerPhone?: string;
  serviceAddress?: string;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  if (!body.slug || !body.itemId || !body.scheduledStart) {
    return NextResponse.json({ error: "Pick a service and a time." }, { status: 422 });
  }
  const name = (body.customerName ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Tell the business your name so they know who is coming." },
      { status: 422 }
    );
  }
  const phone = normalizePhone(body.customerPhone ?? "");
  if (!phone.ok) {
    return NextResponse.json({ error: phone.error }, { status: 422 });
  }

  const db = supabaseServer();
  const { data: business } = await db
    .from("business")
    .select("id, name")
    .eq("shop_slug", body.slug)
    .maybeSingle();
  if (!business) {
    return NextResponse.json(
      { error: "This booking link is not active. Check with the business." },
      { status: 404 }
    );
  }

  // The page is gated the same way, but an endpoint is a door of its own,
  // and a business that never took Services must not have its calendar
  // filled through one.
  const access = await effectiveAccess(business.id).catch(() => null);
  if (!access?.capabilities.has("services.bookings")) {
    return NextResponse.json(
      { error: "This business is not taking bookings right now." },
      { status: 404 }
    );
  }

  const { data: location } = await db
    .from("location")
    .select("id")
    .eq("business_id", business.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const { data, error } = await db.rpc("book_service", {
    p: {
      business_id: business.id,
      location_id: location?.id ?? "",
      item_id: body.itemId,
      membership_id: body.membershipId ?? "",
      scheduled_start: body.scheduledStart,
      customer_name: name,
      customer_phone: phone.e164,
      service_address: body.serviceAddress ?? null,
      client_ref: body.clientRef ?? null,
    },
  });

  if (error) {
    if (/slot_taken/.test(error.message)) {
      return NextResponse.json(
        { error: "Someone just took that time. Pick another one." },
        { status: 409 }
      );
    }
    if (/slot_in_past/.test(error.message)) {
      return NextResponse.json(
        { error: "That time has passed. Pick a later one." },
        { status: 409 }
      );
    }
    if (/service_unavailable/.test(error.message)) {
      return NextResponse.json(
        { error: "That service is no longer offered. Pick another." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We could not book that just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bookingId: data.booking_id,
    status: data.status,
    scheduledStart: data.scheduled_start,
    depositRequired: Number(data.deposit_required ?? 0),
    businessName: business.name,
  });
}
