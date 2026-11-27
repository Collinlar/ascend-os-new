// "Nothing fits" (round 4, S2, decision 5): a customer says which days and
// part of the day suit them. The business sees it and answers from its own
// WhatsApp; Ascend sends it automatically once its templates are approved.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { normalizePhone } from "@/lib/auth/phone";
import { withAuthority } from "@/lib/authority/with-authority";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { businessStatus } from "@/lib/authority/business-status";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  let body: { slug?: string; itemId?: string; membershipId?: string; days?: number[]; part?: string; name?: string; phone?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (name.length < 2) return NextResponse.json({ error: "Tell them your name so they know who asked." }, { status: 422 });
  const phone = normalizePhone(body.phone ?? "");
  if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 422 });
  const days = Array.from(new Set((body.days ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
  if (days.length === 0) return NextResponse.json({ error: "Pick at least one day that suits you." }, { status: 422 });
  const part = ["morning", "afternoon", "any"].includes(body.part ?? "") ? body.part : "any";

  const db = supabaseServer();
  const { data: business } = await db.from("business").select("id").eq("shop_slug", body.slug ?? "").maybeSingle();
  if (!business || (await businessStatus(business.id)) !== "active") return NextResponse.json({ error: "This business is not taking bookings right now." }, { status: 404 });
  const access = await effectiveAccess(business.id).catch(() => null);
  if (!access?.capabilities.has("services.bookings")) return NextResponse.json({ error: "This business is not taking bookings right now." }, { status: 404 });

  // Only this business's own service and person, or none.
  const item = body.itemId ? (await db.from("catalogue_item").select("id").eq("id", body.itemId).eq("business_id", business.id).maybeSingle()).data : null;
  const member = body.membershipId ? (await db.from("business_membership").select("id").eq("id", body.membershipId).eq("business_id", business.id).maybeSingle()).data : null;

  const { error } = await db.from("booking_wish").insert({
    business_id: business.id,
    item_id: item?.id ?? null,
    membership_id: member?.id ?? null,
    days,
    part,
    customer_name: name.slice(0, 80),
    customer_phone: phone.e164,
    note: (body.note ?? "").trim().slice(0, 300) || null,
  });
  if (error) {
    if (/booking_wish/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
      return NextResponse.json({ error: "Asking for a time switches on after this week's update. Message the business on WhatsApp for now." }, { status: 503 });
    }
    return NextResponse.json({ error: "That did not go through. Tap again in a moment." }, { status: 500 });
  }
  return NextResponse.json({ asked: true });
}

export const POST = withAuthority("services/wish", "POST", handlePOST);
