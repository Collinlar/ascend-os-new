// Saving a shop's customer-side settings (Modules round 2, R3): pickup,
// delivery areas and fees, the cut-off, returns, the contact line and the
// promotion. One row per business, so an upsert.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  businessId?: string;
  pickupEnabled?: boolean;
  pickupReadyMinutes?: number | null;
  deliveryEnabled?: boolean;
  deliveryAreas?: Array<{ name?: string; fee?: number | string }>;
  deliveryCutoff?: string | null;
  deliveryNote?: string;
  returnsDays?: number | null;
  returnsNote?: string;
  contactLine?: string;
  promoHeadline?: string;
  promoBody?: string;
  promoItemId?: string | null;
  promoUntil?: string | null;
}

const bad = (error: string) => NextResponse.json({ error }, { status: 422 });
const text = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max) || null;

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap save again." }, { status: 400 });
  }
  if (!body.businessId) return bad("We could not tell which business.");

  if (body.pickupEnabled === false && body.deliveryEnabled === false) {
    return bad("Keep pickup or delivery on, or customers have no way to get their order.");
  }
  const ready = body.pickupReadyMinutes === null || body.pickupReadyMinutes === undefined ? null : Math.round(Number(body.pickupReadyMinutes));
  if (ready !== null && !(ready >= 5 && ready <= 10080)) return bad("Pick a ready time between 5 minutes and 7 days.");

  const areas: Array<{ name: string; fee: number }> = [];
  const seen = new Set<string>();
  for (const a of body.deliveryAreas ?? []) {
    const name = (a.name ?? "").trim().slice(0, 40);
    if (!name) continue;
    const fee = Math.round(Number(a.fee) * 100) / 100;
    if (!Number.isFinite(fee) || fee < 0 || fee > 5000) return bad(`Give ${name} a delivery fee between GHS 0 and GHS 5,000.`);
    if (seen.has(name.toLowerCase())) return bad(`${name} is listed twice. Keep one.`);
    seen.add(name.toLowerCase());
    areas.push({ name, fee });
  }
  if (areas.length > 20) return bad("Keep it to 20 delivery areas or fewer.");

  const cutoff = body.deliveryCutoff ? String(body.deliveryCutoff) : null;
  if (cutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) return bad("Pick a cut-off time like 15:00.");
  const returns = body.returnsDays === null || body.returnsDays === undefined ? null : Math.round(Number(body.returnsDays));
  if (returns !== null && !(returns >= 0 && returns <= 90)) return bad("Returns can be up to 90 days.");

  const headline = text(body.promoHeadline, 60);
  const until = body.promoUntil || null;
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return bad("Pick the date the promotion ends.");

  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", body.businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  // The promotion links to one of this business's own items, or nothing.
  let promoItem: string | null = null;
  if (body.promoItemId) {
    const { data: item } = await db
      .from("catalogue_item")
      .select("id")
      .eq("business_id", body.businessId)
      .eq("id", body.promoItemId)
      .maybeSingle();
    if (!item) return bad("Pick the product or service again for the promotion.");
    promoItem = item.id;
  }

  const { error } = await db.from("shop_settings").upsert(
    {
      business_id: body.businessId,
      pickup_enabled: body.pickupEnabled !== false,
      pickup_ready_minutes: ready,
      delivery_enabled: body.deliveryEnabled !== false,
      delivery_areas: areas,
      delivery_cutoff: cutoff,
      delivery_note: text(body.deliveryNote, 160),
      returns_days: returns,
      returns_note: text(body.returnsNote, 200),
      contact_line: text(body.contactLine, 160),
      promo_headline: headline,
      promo_body: headline ? text(body.promoBody, 160) : null,
      promo_item_id: headline ? promoItem : null,
      promo_until: headline ? until : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" }
  );
  if (error) {
    console.error("shop settings save failed:", error.message);
    return NextResponse.json({ error: "We could not save that just now. Tap again in a moment." }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export const POST = withAuthority("shop/settings", "POST", handlePOST);
