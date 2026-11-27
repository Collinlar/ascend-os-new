// Public booking from Customer Web. No account, no download (SRV-005).
// The slot is held by a database exclusion constraint, so a customer who
// loses a race is told plainly rather than silently double-booked.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { normalizePhone } from "@/lib/auth/phone";
import { withAuthority } from "@/lib/authority/with-authority";
import { businessStatus } from "@/lib/authority/business-status";
import { bookingPath, createBookingLink } from "@/lib/services/booking-link";

interface Body {
  slug?: string;
  clientRef?: string;
  itemId?: string;
  membershipId?: string;
  scheduledStart?: string;
  customerName?: string;
  customerPhone?: string;
  serviceAddress?: string;
  /** Which place, when the business has more than one (round 4, S1). */
  locationId?: string;
  /** "Anything we should know?", kept on the booking for whoever does it. */
  note?: string;
  /** "Send me offers on WhatsApp", unticked unless they tick it. */
  marketingOptIn?: boolean;
  /** The Discover click that brought them, if one did (round 3, P1). */
  discoverRef?: string;
}

async function handlePOST(request: NextRequest) {
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

  // A suspended or closed business takes no new bookings (Phase 1 step 1f).
  if ((await businessStatus(business.id)) !== "active") {
    return NextResponse.json(
      { error: "This business is not taking bookings on Ascend right now." },
      { status: 403 }
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

  // The place they picked, if it is one of this business's; otherwise the
  // first, as before.
  const { data: places } = await db
    .from("location")
    .select("id")
    .eq("business_id", business.id)
    .eq("active", true)
    .order("created_at");
  const location = (places ?? []).find((p) => p.id === body.locationId) ?? (places ?? [])[0] ?? null;

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
    if (/slot_unavailable/.test(error.message)) {
      return NextResponse.json(
        { error: "That time is not free any more. Pick another one." },
        { status: 409 }
      );
    }
    if (/provider_required|provider_not_on_team/.test(error.message)) {
      return NextResponse.json(
        { error: "Pick who you want to see, then choose a time again." },
        { status: 422 }
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

  // What they told us, and the offers opt-in with the booking as its
  // evidence. Neither is ever in the way of the booking itself.
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (note && data.booking_id) {
    await db.from("service_booking").update({ staff_notes: `From the customer: ${note}` }).eq("id", data.booking_id).then(() => null, () => null);
  }
  if (body.marketingOptIn === true && data.booking_id) {
    const { data: booked } = await db.from("service_booking").select("customer_id").eq("id", data.booking_id).maybeSingle();
    if (booked?.customer_id) {
      await db
        .rpc("record_consent", {
          p: {
            customer_id: booked.customer_id,
            business_id: business.id,
            purpose: "marketing",
            granted: true,
            channel: "whatsapp",
            source: "booking_page",
            evidence: { service_booking_id: data.booking_id, asked: `Send me offers from ${business.name} on WhatsApp. You can stop anytime.` },
          },
        })
        .then(() => null, () => null);
    }
  }

  // Counted for the Discover promotion that brought them, if one did. Never
  // in the way of the booking itself (round 3, P1).
  const ref = typeof body.discoverRef === "string" ? body.discoverRef : "";
  if (/^[a-f0-9]{32}$/.test(ref) && data.booking_id) {
    await db.rpc("attribute_discover", { p: { ref, step: "booked", business_id: business.id, service_booking_id: data.booking_id } }).then(
      () => null,
      () => null
    );
  }

  // Their own link to the booking (round 4, S2). Before 0151 there is none.
  const managePath = data.booking_id
    ? await createBookingLink(data.booking_id as string, business.id as string).then(bookingPath, () => null)
    : null;

  return NextResponse.json({
    bookingId: data.booking_id,
    managePath,
    status: data.status,
    scheduledStart: data.scheduled_start,
    depositRequired: Number(data.deposit_required ?? 0),
    reference: `BK-${String(data.booking_id).replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    businessName: business.name,
  });
}

export const POST = withAuthority("services/book", "POST", handlePOST);
