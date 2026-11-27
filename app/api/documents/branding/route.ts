// How a business's documents look. One row per business, so this is an
// upsert rather than a create.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  businessId?: string;
  tradingName?: string;
  addressLine?: string;
  phone?: string;
  email?: string;
  tin?: string;
  footerNote?: string;
  accentColour?: string;
  // How documents look (Modules R2)
  template?: string;
  signatureAreas?: boolean;
  numberPrefixes?: Record<string, string>;
  numberYear?: boolean;
  /** A JPEG the browser made from what was picked, as base64. */
  logoBase64?: string;
  removeLogo?: boolean;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TEMPLATES = ["classic", "modern", "compact"];
const PREFIX = /^[A-Z]{2,6}$/;
const NUMBERED = ["quotation", "proforma", "invoice", "receipt", "credit_note", "purchase_order", "delivery_note"];
const TIN = /^[A-Z0-9-]{4,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handlePOST(request: NextRequest) {
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

  if (body.template !== undefined && !TEMPLATES.includes(body.template)) {
    return NextResponse.json({ error: "Pick Classic, Modern or Compact." }, { status: 422 });
  }
  const tin = body.tin === undefined ? undefined : body.tin.trim().toUpperCase().replace(/\s+/g, "") || null;
  if (tin && !TIN.test(tin)) {
    return NextResponse.json(
      { error: "A TIN is letters and numbers, like C0012345678, or your Ghana Card number." },
      { status: 422 }
    );
  }
  const email = body.email === undefined ? undefined : body.email.trim() || null;
  if (email && !EMAIL.test(email)) {
    return NextResponse.json({ error: "That email address looks incomplete. Check it and save again." }, { status: 422 });
  }
  let prefixes: Record<string, string> | undefined;
  if (body.numberPrefixes !== undefined) {
    prefixes = {};
    for (const [type, raw] of Object.entries(body.numberPrefixes ?? {})) {
      const value = String(raw ?? "").trim().toUpperCase().replace(/-+$/, "");
      if (!NUMBERED.includes(type) || value === "") continue;
      if (!PREFIX.test(value)) {
        return NextResponse.json(
          { error: `${value} will not work as a prefix. Use 2 to 6 letters, like INV or BVM.` },
          { status: 422 }
        );
      }
      prefixes[type] = value;
    }
  }
  let logo: Buffer | null = null;
  if (body.logoBase64) {
    logo = Buffer.from(body.logoBase64, "base64");
    // A JPEG starts FF D8. The browser makes one; anything else is refused.
    if (logo.byteLength < 4 || logo[0] !== 0xff || logo[1] !== 0xd8 || logo.byteLength > 500_000) {
      return NextResponse.json({ error: "That logo did not go through. Pick a PNG or JPG and try again." }, { status: 422 });
    }
  }

  const db = supabaseServer();
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

  // Logo, colour, Modern and Compact, and own numbering are Documents Plus
  // (round 3, P4). Going back to the free look is always allowed. Before
  // 0149 there is no has_documents_plus and nothing is locked.
  const wantsPlus =
    Boolean(logo) ||
    Boolean(accent && body.accentColour !== undefined) ||
    (body.template !== undefined && body.template !== "classic") ||
    (prefixes !== undefined && Object.keys(prefixes).length > 0) ||
    body.numberYear === false;
  if (wantsPlus) {
    const { data: plus, error: plusError } = await db.rpc("has_documents_plus", { p_business: body.businessId });
    if (!plusError && plus !== true) {
      return NextResponse.json(
        { error: "Your logo, colour, the Modern and Compact templates and your own numbering come with Documents Plus.", plus: true },
        { status: 402 }
      );
    }
  }

  let logoUrl: string | null | undefined = body.removeLogo ? null : undefined;
  if (logo) {
    // Filed per business. A changed logo is a new object, so documents
    // already sent keep pointing at the one they were sent with.
    const path = `${body.businessId}/logo-${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await db.storage.from("catalogue").upload(path, logo, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      console.error("logo upload failed:", uploadError.message);
      return NextResponse.json({ error: "We could not save that logo just now. Tap again in a moment." }, { status: 502 });
    }
    logoUrl = db.storage.from("catalogue").getPublicUrl(path).data.publicUrl;
  }

  // Only what was sent changes, so the small panel and the full page can
  // each save their own part.
  const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
  const row: Record<string, unknown> = {
    business_id: body.businessId,
    trading_name: text(body.tradingName),
    address_line: text(body.addressLine),
    phone: text(body.phone),
    email,
    tin,
    footer_note: text(body.footerNote),
    accent_colour: body.accentColour === undefined ? undefined : accent,
    template: body.template,
    signature_areas: typeof body.signatureAreas === "boolean" ? body.signatureAreas : undefined,
    number_prefixes: prefixes,
    number_year: typeof body.numberYear === "boolean" ? body.numberYear : undefined,
    logo_url: logoUrl,
    updated_at: new Date().toISOString(),
  };
  for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];

  const { error } = await db.from("document_branding").upsert(row, { onConflict: "business_id" });

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
  return NextResponse.json({ saved: true, logoUrl: logoUrl ?? undefined });
}

export const POST = withAuthority("documents/branding", "POST", handlePOST);
