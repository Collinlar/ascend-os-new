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
}

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
  return null;
}

function attributes(body: Body) {
  return {
    duration_minutes: body.durationMinutes,
    buffer_minutes: body.bufferMinutes ?? 0,
    // Every slot offered is a real slot somebody can take, so the model is
    // fixed_slot. The others in the enum are a different product.
    booking_model: "fixed_slot",
    ...(body.depositAmount ? { deposit_amount: body.depositAmount } : {}),
  };
}

export async function GET() {
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

export async function POST(request: NextRequest) {
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

export async function PATCH(request: NextRequest) {
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
  };
}
