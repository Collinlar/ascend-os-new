// How a business's documents look. One row per business, so this is an
// upsert rather than a create.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface Body {
  businessId?: string;
  tradingName?: string;
  addressLine?: string;
  phone?: string;
  footerNote?: string;
  accentColour?: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  if (!body.businessId) {
    return NextResponse.json({ error: "We could not tell which business." }, { status: 422 });
  }

  const accent = body.accentColour?.trim() || null;
  if (accent && !HEX.test(accent)) {
    return NextResponse.json(
      { error: "A colour looks like #1D9E75. Six letters or numbers after the hash." },
      { status: 422 }
    );
  }

  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id, role")
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

  const { error } = await db.from("document_branding").upsert(
    {
      business_id: body.businessId,
      trading_name: body.tradingName?.trim() || null,
      address_line: body.addressLine?.trim() || null,
      phone: body.phone?.trim() || null,
      footer_note: body.footerNote?.trim() || null,
      accent_colour: accent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" }
  );

  if (error) {
    // The real cause goes to the server log, not to the merchant, who can
    // do nothing with a Postgres message.
    console.error("branding save failed:", error.message);
    return NextResponse.json(
      { error: "We could not save that just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  // Only documents issued from now on carry it. Anything already sent keeps
  // the look it was sent with, which is the point of freezing it.
  return NextResponse.json({ saved: true });
}
