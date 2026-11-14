// Approved catalogue creation (SHP-003, SHP-006). The merchant reviewed and
// edited the AI suggestion; this endpoint writes the shared catalogue item
// plus its Shop channel listing, records approval status, and publishes the
// catalogue event.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

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

  // One call: the product, its shop listing and its event are written in a
  // single transaction (0071). These used to be three separate writes, so a
  // failure in between left a product with no listing, invisible in the shop
  // with nothing to say why, or a listing with no event behind it.
  const { data, error } = await db.rpc("publish_catalogue_item", {
    p: {
      business_id: body.businessId,
      actor_membership_id: membership.id,
      name,
      description: body.description ?? "",
      category: body.category ?? "",
      base_price: body.price ?? "",
      currency_code: "GHS",
      ai_suggestion: body.aiSuggestion ?? null,
      photo_url: body.photoUrl ?? "",
      media: body.media ?? [],
    },
  });

  if (error || !data?.item_id) {
    if (error) console.error("publish_catalogue_item failed:", error.message);
    return NextResponse.json(
      { error: "We could not save this product just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ itemId: data.item_id });
}
