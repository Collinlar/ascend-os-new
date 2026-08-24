// Catalogue pull for a registered terminal (POS-SYN-007, POS-OFF-002). The
// device gets prices and stock for its own business only; the response is
// what the till holds locally so it can sell with no network.

import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// A response with no cache directive is not uncached: browsers apply their
// own heuristics and may reuse it. That is fine for a marketing page and
// wrong for the two requests a till depends on being current, which is how
// a merchant ends up adding products and watching a counter show yesterday.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET(request: NextRequest) {
  const device = await authenticateDevice(request);
  if (!device) {
    return NextResponse.json(
      { error: "This till is not set up. Ask the owner for a pairing code." },
      { status: 401, headers: NO_STORE });
  }

  const db = supabaseServer();

  // Same tolerance as the write path: a till whose database has not run
  // migration 0036 yet must still get its catalogue, without pictures,
  // rather than losing the ability to sell.
  interface ItemRow {
    id: string;
    name: string;
    base_price: string | number;
    track_stock: boolean;
    barcode: string | null;
    category: string | null;
    photo_url?: string | null;
  }

  const BASE_COLUMNS = "id, name, base_price, track_stock, barcode, category";

  async function fetchItems(columns: string) {
    return db
      .from("catalogue_item")
      .select(columns)
      .eq("business_id", device!.businessId)
      .eq("active", true)
      .not("base_price", "is", null);
  }

  let result = await fetchItems(`${BASE_COLUMNS}, photo_url`);
  if (result.error && /photo_url/.test(result.error.message)) {
    result = await fetchItems(BASE_COLUMNS);
  }

  if (result.error) {
    return NextResponse.json(
      { error: "We could not load your products just now. Tap sync again." },
      { status: 502, headers: NO_STORE });
  }

  const items = (result.data ?? []) as unknown as ItemRow[];

  let receiptSeqHigh = 0;
  try {
    const { data: high } = await db.rpc("device_receipt_high", {
      p_device: device.deviceId,
    });
    receiptSeqHigh = Number(high ?? 0);
  } catch {
    // A till that cannot be told will keep its own count, which is only a
    // problem if that count was already lost.
  }

  // Location-aware stock so the till shows what is actually on this shelf.
  const { data: balances } = await db
    .from("stock_balance")
    .select("item_id, quantity_on_hand")
    .eq("business_id", device.businessId)
    .eq("location_id", device.locationId);

  const stockByItem = new Map(
    (balances ?? []).map((b) => [b.item_id as string, Number(b.quantity_on_hand)])
  );

  return NextResponse.json({
    businessId: device.businessId,
    locationId: device.locationId,
    label: device.label,
    leaseExpiresAt: device.leaseExpiresAt,
    deviceNumber: device.deviceNumber ?? null,
    // The highest receipt number this till has reached, so one whose local
    // counter was cleared resumes from the truth instead of from one and
    // colliding with everything it already issued.
    receiptSeqHigh,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.base_price),
      trackStock: item.track_stock,
      localStock: item.track_stock ? (stockByItem.get(item.id) ?? 0) : undefined,
      barcode: item.barcode,
      category: item.category,
      photoUrl: item.photo_url ?? null,
    })),
  }, { headers: NO_STORE });
}
