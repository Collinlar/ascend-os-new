// The merchant's products: what they sell, for how much, and what is left.
//
// Session-guarded and membership-scoped. This is the owner side of the same
// catalogue the till reads, so a change here reaches the shelf on the next
// sync without anything being entered twice.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export interface StockRow {
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

export async function GET(request: NextRequest) {
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
    return NextResponse.json(
      { error: "We could not load your products just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: (data ?? []).map(toRow) });
}

export async function PATCH(request: NextRequest) {
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
  if (body.shopVisible !== undefined || body.shopPriceOverride !== undefined) {
    const { error: channelError } = await db.rpc("set_channel_listing", {
      p: {
        business_id: body.businessId,
        item_id: body.itemId,
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
      return NextResponse.json(
        { error: "Saved, but we could not change where it sells. Tap again." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ saved: true });
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
  };
}
