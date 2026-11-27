// The merchant's products: what they sell, for how much, and what is left.
//
// Session-guarded and membership-scoped. This is the owner side of the same
// catalogue the till reads, so a change here reaches the shelf on the next
// sync without anything being entered twice.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";

export const dynamic = "force-dynamic";

export interface StockRow {
  /** How to use it, what is inside, good for (round 4, S1). */
  details?: { use: string; inside: string; goodFor: string };
  itemId: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  category: string | null;
  price: number | null;
  barcode: string | null;
  trackStock: boolean;
  active: boolean;
  lowStockThreshold: number | null;
  quantityOnHand: number;
  lastMovementAt: string | null;
  /** Null when the business has never listed this on its Shop. */
  shopVisible: boolean | null;
  shopPriceOverride: number | null;
  /** Sizes customers choose from, each with a price difference (round 2, R4). */
  sizes: Array<{ id: string; name: string; priceDelta: number }>;
}

async function scope(personId: string, businessId: string) {
  const db = supabaseServer();
  const { data } = await db
    .from("business_membership")
    .select("id, role:role_id(key)")
    .eq("business_id", businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const roleKey = (data.role as unknown as { key: string } | null)?.key;
  // Cashiers sell from the catalogue; they do not reprice it.
  if (roleKey !== "owner" && roleKey !== "manager") return null;
  return { membershipId: data.id as string };
}

async function handleGET(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  const businessId = request.nextUrl.searchParams.get("businessId");
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!businessId || !locationId) {
    return NextResponse.json({ error: "Pick which shop to look at." }, { status: 422 });
  }
  if (!(await scope(personId, businessId))) {
    return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });
  }

  const db = supabaseServer();
  const { data, error } = await db.rpc("business_stock_levels", {
    p_business: businessId,
    p_location: locationId,
  });
  if (error) {


    const denied = deniedByDatabase(error);

    if (denied) return denied;
    return NextResponse.json(
      { error: "We could not load your products just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: (data ?? []).map(toRow) });
}

async function handlePATCH(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: {
    businessId?: string;
    itemId?: string;
    name?: string;
    description?: string | null;
    category?: string | null;
    photoUrl?: string | null;
    price?: number | string;
    barcode?: string | null;
    trackStock?: boolean;
    active?: boolean;
    lowStockThreshold?: number | string | null;
    // Where it sells. Only meaningful for a business with Shop, and simply
    // absent for one that has not.
    shopVisible?: boolean;
    shopPriceOverride?: number | string | null;
    /** How to use it, what is inside, good for (round 4, S1); "" clears. */
    details?: { use?: string | null; inside?: string | null; goodFor?: string | null };
    /** The whole list of sizes; any left out are switched off (0144). */
    sizes?: Array<{ id?: string | null; name?: string; priceDelta?: number | string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap save again." }, { status: 400 });
  }

  if (!body.businessId || !body.itemId) {
    return NextResponse.json({ error: "Pick which product to change." }, { status: 422 });
  }
  if (!(await scope(personId, body.businessId))) {
    return NextResponse.json(
      { error: "Only the owner or a manager can change a product." },
      { status: 403 }
    );
  }
  if (body.price !== undefined && Number(body.price) < 0) {
    return NextResponse.json({ error: "A price cannot be less than zero." }, { status: 422 });
  }

  const scoped = await scope(personId, body.businessId);
  const payload: Record<string, unknown> = {
    business_id: body.businessId,
    item_id: body.itemId,
    actor_membership_id: scoped?.membershipId ?? "",
  };
  // Sent only when present, so editing one field never blanks another.
  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description ?? "";
  if (body.category !== undefined) payload.category = body.category ?? "";
  if (body.photoUrl !== undefined) payload.photo_url = body.photoUrl ?? "";
  if (body.price !== undefined) payload.base_price = String(body.price);
  // Sent explicitly so clearing a barcode is distinguishable from leaving
  // it alone.
  if (body.barcode !== undefined) payload.barcode = body.barcode ?? "";
  if (body.trackStock !== undefined) payload.track_stock = body.trackStock;
  if (body.active !== undefined) payload.active = body.active;
  if (body.lowStockThreshold !== undefined) {
    payload.low_stock_threshold = body.lowStockThreshold ?? "";
  }

  const db = supabaseServer();
  const { error } = await db.rpc("update_catalogue_item", { p: payload });
  if (error) {


    const denied = deniedByDatabase(error);

    if (denied) return denied;
    if (/barcode_taken/.test(error.message)) {
      return NextResponse.json(
        { error: "Another product already uses that barcode." },
        { status: 409 }
      );
    }
    if (/name_required/.test(error.message)) {
      return NextResponse.json(
        { error: "Give the product a name your customers will recognise." },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "We could not save that change just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  // The update function takes a single jsonb argument, so a database that
  // has not run migration 0038 accepts the new fields and quietly drops
  // them. Silence is the worst outcome here: a merchant retypes a name,
  // sees it save, and finds it unchanged. Confirming the write turns that
  // into something they can act on.
  if (body.name !== undefined) {
    const { data: check } = await db
      .from("catalogue_item")
      .select("name")
      .eq("id", body.itemId)
      .maybeSingle();
    if (check && check.name !== body.name.trim()) {
      return NextResponse.json(
        {
          error:
            "This site cannot save product names yet. Ask whoever runs it to apply the latest update.",
        },
        { status: 503 }
      );
    }
  }

  // Channel settings are a separate record, so they are written separately
  // and a failure there does not undo the product edit.
  // Sizes, after the price, so a size is checked against the new price.
  let savedSizes: Array<{ id: string; name: string; priceDelta: number }> | undefined;
  if (Array.isArray(body.sizes)) {
    const { data: sizeData, error: sizeError } = await db.rpc("set_item_variants", {
      p: {
        business_id: body.businessId,
        item_id: body.itemId,
        actor_membership_id: scoped?.membershipId ?? "",
        sizes: body.sizes.map((s) => ({ id: s.id ?? "", name: s.name ?? "", price_delta: String(Number(s.priceDelta ?? 0) || 0) })),
      },
    });
    if (sizeError) {
      const denied = deniedByDatabase(sizeError);
      if (denied) return denied;
      const repeated = /size_repeated\|(.+)$/.exec(sizeError.message);
      const negative = /size_price_negative\|(.+)$/.exec(sizeError.message);
      return NextResponse.json(
        {
          error: repeated
            ? `${repeated[1]} is listed twice. Keep one.`
            : negative
              ? `${negative[1]} would cost less than nothing. Lower the discount.`
              : /too_many_sizes/.test(sizeError.message)
                ? "Keep it to 12 sizes or fewer."
                : /function .* does not exist|set_item_variants/.test(sizeError.message)
                  ? "Sizes switch on after this week's update. Everything else saved."
                  : "We could not save the sizes just now. Tap save again.",
        },
        { status: 422 }
      );
    }
    savedSizes = ((sizeData?.sizes ?? []) as Array<{ id: string; name: string; price_delta: number | string }>).map((v) => ({
      id: v.id,
      name: v.name,
      priceDelta: Number(v.price_delta),
    }));
  }

  if (body.shopVisible !== undefined || body.shopPriceOverride !== undefined) {
    const { error: channelError } = await db.rpc("set_channel_listing", {
      p: {
        business_id: body.businessId,
        item_id: body.itemId,
        // Who is changing it, so the database can check (0079).
        actor_membership_id: scoped?.membershipId ?? "",
        channel: "shop",
        visible: body.shopVisible,
        price_override:
          body.shopPriceOverride === undefined
            ? undefined
            : body.shopPriceOverride === null
              ? ""
              : String(body.shopPriceOverride),
      },
    });
    if (channelError) {


      const denied = deniedByDatabase(channelError);

      if (denied) return denied;
      return NextResponse.json(
        { error: "Saved, but we could not change where it sells. Tap again." },
        { status: 502 }
      );
    }
  }

  // The product's own sections (round 4, S1). Saved after the product, and
  // only what was sent. Before 0150 there is nowhere to keep them.
  if (body.details) {
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : (v ?? "").trim().slice(0, 600) || null);
    const patch: Record<string, string | null> = {};
    const use = clean(body.details.use);
    const inside = clean(body.details.inside);
    const goodFor = clean(body.details.goodFor);
    if (use !== undefined) patch.how_to_use = use;
    if (inside !== undefined) patch.what_is_inside = inside;
    if (goodFor !== undefined) patch.good_for = goodFor;
    if (Object.keys(patch).length) {
      const { error: detailsError } = await db.from("catalogue_item").update(patch).eq("id", body.itemId).eq("business_id", body.businessId);
      if (detailsError && !/how_to_use|what_is_inside|good_for/.test(detailsError.message)) {
        return NextResponse.json({ error: "The product saved, but its sections did not. Tap save again." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ saved: true, ...(savedSizes ? { sizes: savedSizes } : {}) });
}

function toRow(row: {
  item_id: string;
  name: string;
  description?: string | null;
  category: string | null;
  base_price: string | number | null;
  barcode: string | null;
  photo_url?: string | null;
  track_stock: boolean;
  active: boolean;
  low_stock_threshold: string | number | null;
  quantity_on_hand: string | number;
  last_movement_at: string | null;
  shop_visible?: boolean | null;
  shop_price_override?: string | number | null;
}): StockRow {
  return {
    itemId: row.item_id,
    name: row.name,
    description: row.description ?? null,
    photoUrl: row.photo_url ?? null,
    category: row.category,
    price: row.base_price === null ? null : Number(row.base_price),
    barcode: row.barcode,
    trackStock: row.track_stock,
    active: row.active,
    lowStockThreshold:
      row.low_stock_threshold === null ? null : Number(row.low_stock_threshold),
    quantityOnHand: Number(row.quantity_on_hand),
    lastMovementAt: row.last_movement_at,
    shopVisible: row.shop_visible ?? null,
    shopPriceOverride:
      row.shop_price_override === null || row.shop_price_override === undefined
        ? null
        : Number(row.shop_price_override),
    // The GET list does not carry sizes; the products page loads them.
    sizes: [],
  };
}

export const GET = withAuthority("catalogue/items", "GET", handleGET);
export const PATCH = withAuthority("catalogue/items", "PATCH", handlePATCH);
