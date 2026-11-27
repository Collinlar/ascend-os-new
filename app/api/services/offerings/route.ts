// What a business offers to be booked for.
//
// catalogue_item has had a kind column since the second migration, enum
// ('product', 'service'), defaulting to product. Nothing in the app has
// ever set it to service. So the booking page has always queried for
// services and always found none, and the whole of Ascend Services has
// been reachable, gated, scheduled and unbookable.
//
// A service is the same catalogue item a product is, which is the point of
// one catalogue. What makes it bookable is its kind and the handful of
// facts in service_attributes that available_slots and book_service read:
// how long it takes, what gap to leave after it, and what is due up front.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number;
  bufferMinutes: number;
  depositAmount: number | null;
  active: boolean;
  /** How it is booked (round 4, S3): a time, a class, or a quotation first. */
  bookingModel: "fixed_slot" | "class_session" | "quote_first";
  /** Also at the customer's home, with a flat travel fee (decision 2). */
  home: { enabled: boolean; travelFee: number; areas: string };
  /** The deposit on an accepted quotation, as a share of it. */
  depositPercent: number | null;
}

interface Body {
  businessId?: string;
  itemId?: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  depositAmount?: number | null;
  active?: boolean;
  bookingModel?: string;
  home?: { enabled?: boolean; travelFee?: number | null; areas?: string | null };
  depositPercent?: number | null;
}

const MODELS = ["fixed_slot", "class_session", "quote_first"];

// Owner or manager. A service's price and duration are what the business
// charges and promises, so a cashier does not set them.
async function scope(personId: string, businessId: string) {
  const { data } = await supabaseServer()
    .from("business_membership")
    .select("id, role:role_id(key)")
    .eq("business_id", businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const role = (data.role as unknown as { key: string } | null)?.key;
  if (role !== "owner" && role !== "manager") return null;
  return { membershipId: data.id as string };
}

function validate(body: Body): string | null {
  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return "Give this service a name your customers would recognise.";
  }
  const duration = body.durationMinutes ?? 0;
  if (!(duration >= 5 && duration <= 8 * 60)) {
    return "How long does it take? Anything from 5 minutes to 8 hours.";
  }
  if (body.price !== null && body.price !== undefined && body.price < 0) {
    return "A price cannot be less than nothing.";
  }
  if (
    body.depositAmount !== null &&
    body.depositAmount !== undefined &&
    body.price !== null &&
    body.price !== undefined &&
    body.depositAmount > body.price
  ) {
    return "The deposit cannot be more than the whole price.";
  }
  if (body.bookingModel !== undefined && !MODELS.includes(body.bookingModel)) {
    return "Pick how it is booked: a time, a class, or a quotation first.";
  }
  if (body.home?.enabled) {
    const fee = Number(body.home.travelFee ?? 0);
    if (!(fee >= 0 && fee <= 5000)) return "A travel fee is between GHS 0 and GHS 5,000.";
    if ((body.home.areas ?? "").trim().length < 3) return "Say where you go, like Within Accra or East Legon and Airport.";
  }
  if (body.depositPercent !== null && body.depositPercent !== undefined && !(body.depositPercent >= 0 && body.depositPercent <= 100)) {
    return "A deposit share is between 0 and 100 percent.";
  }
  return null;
}

function attributes(body: Body) {
  return {
    duration_minutes: body.durationMinutes,
    buffer_minutes: body.bufferMinutes ?? 0,
    // How it is booked (round 4, S3): a real slot, a class with seats, or
    // a quotation first. Home service is only for a slot.
    booking_model: MODELS.includes(body.bookingModel ?? "") ? body.bookingModel : "fixed_slot",
    ...(body.depositAmount ? { deposit_amount: body.depositAmount } : {}),
    ...((body.bookingModel ?? "fixed_slot") === "fixed_slot" && body.home?.enabled
      ? { home: { enabled: true, travel_fee: Number(body.home.travelFee ?? 0), areas: (body.home.areas ?? "").trim().slice(0, 120) } }
      : {}),
    ...(body.bookingModel === "quote_first" && body.depositPercent !== null && body.depositPercent !== undefined
      ? { deposit_percent: Number(body.depositPercent) }
      : {}),
  };
}

async function handleGET() {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out." }, { status: 401 });
  }
  const membership = await activeMembership<{ business_id: string }>(personId);
  if (!membership) return NextResponse.json({ services: [] });

  const { data } = await supabaseServer()
    .from("catalogue_item")
    .select("id, name, description, base_price, active, service_attributes")
    .eq("business_id", membership.business_id)
    .eq("kind", "service")
    .order("name");

  return NextResponse.json({ services: (data ?? []).map(toRow) });
}

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Sign in to pick up where you left off." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap save again." }, { status: 400 });
  }

  if (!body.businessId) {
    return NextResponse.json(
      { error: "We lost track of which business this is. Refresh and try again." },
      { status: 422 }
    );
  }
  const problem = validate(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  const acting = await scope(personId, body.businessId);
  if (!acting) {
    return NextResponse.json(
      { error: "Only the owner or a manager can change what you offer." },
      { status: 403 }
    );
  }

  const access = await effectiveAccess(body.businessId).catch(() => null);
  if (!access?.capabilities.has("services.bookings")) {
    return NextResponse.json(
      { error: "Add Ascend Services before you set up what you offer." },
      { status: 403 }
    );
  }

  const { data: item, error } = await supabaseServer()
    .from("catalogue_item")
    .insert({
      business_id: body.businessId,
      kind: "service",
      name: (body.name ?? "").trim(),
      description: body.description ?? null,
      base_price: body.price ?? null,
      currency_code: "GHS",
      service_attributes: attributes(body),
    })
    .select("id, name, description, base_price, active, service_attributes")
    .single();

  if (error || !item) {
    return NextResponse.json(
      { error: "We could not save this service just now. Tap save again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ service: toRow(item) });
}

async function handlePATCH(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out." }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap save again." }, { status: 400 });
  }

  if (!body.businessId || !body.itemId) {
    return NextResponse.json({ error: "Pick a service to change." }, { status: 422 });
  }

  const acting = await scope(personId, body.businessId);
  if (!acting) {
    return NextResponse.json(
      { error: "Only the owner or a manager can change what you offer." },
      { status: 403 }
    );
  }

  const db = supabaseServer();

  // Stopping a service is one field, and it does not have to carry a valid
  // name and duration with it.
  const stopOnly = body.active !== undefined && body.name === undefined;

  if (!stopOnly) {
    const problem = validate(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  }

  const patch: Record<string, unknown> = stopOnly
    ? { active: body.active }
    : {
        name: (body.name ?? "").trim(),
        description: body.description ?? null,
        base_price: body.price ?? null,
        service_attributes: attributes(body),
        ...(body.active !== undefined ? { active: body.active } : {}),
      };

  const { data: item, error } = await db
    .from("catalogue_item")
    .update(patch)
    .eq("id", body.itemId)
    .eq("business_id", body.businessId)
    .eq("kind", "service")
    .select("id, name, description, base_price, active, service_attributes")
    .single();

  if (error || !item) {
    return NextResponse.json(
      { error: "We could not save that change. Tap save again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ service: toRow(item) });
}

function toRow(item: {
  id: string;
  name: string;
  description: string | null;
  base_price: number | string | null;
  active: boolean;
  service_attributes: Record<string, unknown> | null;
}): ServiceRow {
  const attrs = item.service_attributes ?? {};
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.base_price === null ? null : Number(item.base_price),
    durationMinutes: Number(attrs.duration_minutes ?? 60),
    bufferMinutes: Number(attrs.buffer_minutes ?? 0),
    depositAmount: attrs.deposit_amount ? Number(attrs.deposit_amount) : null,
    active: item.active,
    bookingModel: (MODELS.includes(String(attrs.booking_model)) ? attrs.booking_model : "fixed_slot") as ServiceRow["bookingModel"],
    home: (() => {
      const h = (attrs.home ?? {}) as { enabled?: boolean; travel_fee?: number; areas?: string };
      return { enabled: h.enabled === true, travelFee: Number(h.travel_fee ?? 0), areas: h.areas ?? "" };
    })(),
    depositPercent: attrs.deposit_percent === undefined ? null : Number(attrs.deposit_percent),
  };
}

export const GET = withAuthority("services/offerings", "GET", handleGET);
export const POST = withAuthority("services/offerings", "POST", handlePOST);
export const PATCH = withAuthority("services/offerings", "PATCH", handlePATCH);
