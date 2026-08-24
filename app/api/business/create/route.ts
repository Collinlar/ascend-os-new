import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import type { ProductSetKey } from "@/lib/domains/types";

const ENTRY_SETS: ProductSetKey[] = ["pos", "shop", "services", "documents"];

const ARCHETYPE_BY_ENTRY: Record<string, string> = {
  pos: "walk_in_retail",
  shop: "online_seller",
  services: "appointment_service",
  documents: "professional_firm",
};

// Creates the business through the create_business transaction: business,
// first location, roles, owner membership, free Start entitlement, event
// and audit in one commit.
export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to pick up where you left off." },
      { status: 401 }
    );
  }

  let body: { name?: string; city?: string; entryProductSet?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap again." },
      { status: 400 }
    );
  }

  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Give your business its name so customers recognise it." },
      { status: 422 }
    );
  }
  const entry = (body.entryProductSet ?? "pos") as ProductSetKey;
  if (!ENTRY_SETS.includes(entry)) {
    return NextResponse.json({ error: "Pick one of the starting points." }, { status: 422 });
  }

  const db = supabaseServer();

  // Double-submit guard: same owner, same name, already created.
  const { data: existing } = await db
    .from("business_membership")
    .select("business_id, business:business_id(name)")
    .eq("person_id", personId)
    .eq("status", "active");
  const duplicate = (existing ?? []).find(
    (m) => (m.business as unknown as { name: string })?.name?.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return NextResponse.json({ businessId: duplicate.business_id, duplicate: true });
  }

  const { data, error } = await db.rpc("create_business", {
    p: {
      person_id: personId,
      name,
      city: body.city ?? null,
      country_code: "GH",
      archetype: ARCHETYPE_BY_ENTRY[entry],
      entry_product_set: entry,
      onboarding_source: { channel: "self_service_web" },
    },
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not set up your business just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    businessId: data.business_id,
    locationId: data.location_id,
    membershipId: data.membership_id,
  });
}
