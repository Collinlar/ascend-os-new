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
  /** Round 4, S3: a home visit, seats in a class, or a quotation request. */
  kind?: "home" | "class" | "quote";
  classSessionId?: string;
  seats?: number;
  detail?: { occasion?: string; date?: string; people?: string; where?: string; note?: string };
  /** Inspiration photos for a quotation request, JPEG base64, up to 3. */
  photos?: string[];
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

  const kind = body.kind === "home" || body.kind === "class" || body.kind === "quote" ? body.kind : null;
  if (!body.slug || !body.itemId || (!body.scheduledStart && kind !== "quote" && kind !== "class")) {
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

  // Inspiration photos for a quotation request go to the private reports
  // bucket, filed under the business, before the request names them.
  const uploaded: Array<{ path: string; name: string }> = [];
  if (kind === "quote") {
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
    if (photos.length > 3) return NextResponse.json({ error: "Three photos are enough. Remove one and send again." }, { status: 422 });
    for (let i = 0; i < photos.length; i += 1) {
      const p = photos[i];
      const bytes = Buffer.from(String(p), "base64");
      if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.byteLength > 1_500_000) {
        return NextResponse.json({ error: "One of the photos did not go through. Pick it again and send." }, { status: 422 });
      }
      const path = `${business.id}/request-${crypto.randomUUID()}.jpg`;
      const { error: upError } = await db.storage.from("reports").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (upError) {
        if (uploaded.length) await db.storage.from("reports").remove(uploaded.map((u) => u.path));
        return NextResponse.json({ error: "We could not keep your photos just now. Tap again in a moment." }, { status: 502 });
      }
      uploaded.push({ path, name: `photo-${i + 1}.jpg` });
    }
  }

  const common = { business_id: business.id, item_id: body.itemId, customer_name: name, customer_phone: phone.e164, client_ref: body.clientRef ?? null };
  const { data, error } =
    kind === "class"
      ? await db.rpc("book_class_seats", { p: { ...common, class_session_id: body.classSessionId ?? "", seats: Number(body.seats) || 1 } })
      : kind === "home"
        ? await db.rpc("request_home_booking", {
            p: { ...common, membership_id: body.membershipId ?? "", scheduled_start: body.scheduledStart, service_address: body.serviceAddress ?? "" },
          })
        : kind === "quote"
          ? await db.rpc("request_quote_booking", {
              p: {
                ...common,
                detail: {
                  occasion: (body.detail?.occasion ?? "").slice(0, 60),
                  date: body.detail?.date ?? "",
                  people: (body.detail?.people ?? "").slice(0, 60),
                  where: (body.detail?.where ?? "").slice(0, 160),
                  note: (body.detail?.note ?? "").slice(0, 500),
                  photos: uploaded,
                },
              },
            })
          : await db.rpc("book_service", {
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
  if (error && uploaded.length) await db.storage.from("reports").remove(uploaded.map((u) => u.path));

  if (error) {
    const s3: Array<[RegExp, string, number]> = [
      [/class_full: (\d+)/, `That class is full for that many. ${(/class_full: (\d+)/.exec(error.message) ?? [])[1] ?? "No"} seats are left.`, 409],
      [/class_started|class_not_found/, "That class is no longer open. Pick another.", 409],
      [/seats_out_of_range/, "Book between 1 and 20 seats.", 422],
      [/no_home_service/, "This service is not done at home. Pick one of the places.", 409],
      [/address_needed/, "Tell them where to come: your address, GhanaPost GPS or a landmark.", 422],
      [/date_needed/, "Pick the date of the day, today or later.", 422],
      [/not_quote_first/, "This service is booked with a time. Go back and pick one.", 409],
      [/too_many_photos|photo_not_ours/, "One of the photos did not go through. Pick it again and send.", 422],
      [/function .* does not exist|Could not find the function/, "This kind of booking switches on after this week's update. Message the business on WhatsApp for now.", 503],
    ];
    const hit = s3.find(([re]) => re.test(error.message));
    if (hit) return NextResponse.json({ error: hit[1] }, { status: hit[2] });
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
