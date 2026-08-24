// Approved catalogue creation (SHP-003, SHP-006). The merchant reviewed and
// edited the AI suggestion; this endpoint writes the shared catalogue item
// plus its Shop channel listing, records approval status, and publishes the
// catalogue event.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { publishEvent } from "@/lib/domains/events";

interface CreateItemBody {
  businessId?: string;
  name?: string;
  description?: string;
  category?: string;
  price?: number;
  media?: string[];
  photoUrl?: string | null;
  aiSuggestion?: Record<string, unknown>; // original suggestion, kept for provenance (API-012)
}

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: CreateItemBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap save again." },
      { status: 400 }
    );
  }

  const name = (body.name ?? "").trim();

  // These were one check, so a request with no business reported itself as
  // a missing name. A merchant then stared at a perfectly good name being
  // rejected for being absent, which is the sort of thing that makes people
  // stop trusting the tool.
  if (!body.businessId) {
    return NextResponse.json(
      { error: "We lost track of which business this is. Refresh and try again." },
      { status: 422 }
    );
  }
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Give the product a name your customers will recognise." },
      { status: 422 }
    );
  }
  if (body.price !== undefined && !(body.price > 0)) {
    return NextResponse.json(
      { error: "Set a price above zero, in GHS." },
      { status: 422 }
    );
  }

  const db = supabaseServer();

  // Membership scope check: only active members create catalogue records.
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", body.businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to this business." },
      { status: 403 }
    );
  }

  // Written twice if it has to be. Migration 0036 adds photo_url, and this
  // code may reach a database that has not run it yet. A product that saves
  // without its picture is far better than one that will not save at all,
  // and it means the migration and the deploy can land in either order.
  const base = {
    business_id: body.businessId,
    kind: "product" as const,
    name,
    description: body.description ?? null,
    category: body.category ?? null,
    base_price: body.price ?? null,
    currency_code: "GHS",
    ai_suggestion: body.aiSuggestion ?? null,
    ai_content_approved_at: body.aiSuggestion ? new Date().toISOString() : null,
  };

  let { data: item, error } = await db
    .from("catalogue_item")
    .insert({ ...base, photo_url: body.photoUrl ?? null })
    .select("id")
    .single();

  if (error && /photo_url/.test(error.message)) {
    ({ data: item, error } = await db
      .from("catalogue_item")
      .insert(base)
      .select("id")
      .single());
  }

  if (error || !item) {
    return NextResponse.json(
      { error: "We could not save this product just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  await db.from("channel_listing").insert({
    item_id: item.id,
    channel: "shop",
    media: body.media ?? [],
    visible: true,
  });

  await publishEvent({
    eventType: "shop.catalogue.published",
    businessId: body.businessId,
    actorMembershipId: membership.id,
    channel: "business_web",
    productSet: "shop",
    entityType: "catalogue_item",
    entityId: item.id,
    payload: { ai_assisted: Boolean(body.aiSuggestion) },
  });

  return NextResponse.json({ itemId: item.id });
}
