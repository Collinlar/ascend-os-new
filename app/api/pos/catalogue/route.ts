// Catalogue pull for a registered terminal (POS-SYN-007, POS-OFF-002). The
// device gets prices and stock for its own business only; the response is
// what the till holds locally so it can sell with no network.

import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

// A response with no cache directive is not uncached: browsers apply their
// own heuristics and may reuse it. That is fine for a marketing page and
// wrong for the two requests a till depends on being current, which is how
// a merchant ends up adding products and watching a counter show yesterday.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

async function handleGET(request: NextRequest) {
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
    stock_enforcement?: string | null;
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

  let result = await fetchItems(`${BASE_COLUMNS}, photo_url, stock_enforcement`);
  if (result.error && /photo_url|stock_enforcement/.test(result.error.message)) {
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

  // The names the customer sees: on the receipt and on the customer display.
  // A till used to print its own label ("Till 1") where the business name
  // belongs.
  const [{ data: biz }, { data: place }] = await Promise.all([
    db.from("business").select("name").eq("id", device.businessId).maybeSingle(),
    db.from("location").select("name").eq("id", device.locationId).maybeSingle(),
  ]);

  // Location-aware stock so the till shows what is actually on this shelf.
  const { data: balances } = await db
    .from("stock_balance")
    .select("item_id, quantity_on_hand")
    .eq("business_id", device.businessId)
    .eq("location_id", device.locationId);

  const stockByItem = new Map(
    (balances ?? []).map((b) => [b.item_id as string, Number(b.quantity_on_hand)])
  );
  // Available to sell, not just on the shelf: what open shop orders have set
  // aside here is spoken for (Inventory Core I2). Holds are written negative.
  const { data: holds } = await db
    .from("stock_reserved")
    .select("item_id, quantity_reserved")
    .eq("business_id", device.businessId)
    .eq("location_id", device.locationId);
  for (const h of holds ?? []) {
    const id = h.item_id as string;
    stockByItem.set(id, (stockByItem.get(id) ?? 0) + Number(h.quantity_reserved));
  }

  // Goods on the way to this till's place (Advanced Inventory A1, 0131), so
  // whoever is at the counter when they arrive can count them in here. The
  // names only: how many were sent stays off the till, so the count is of
  // what is in the box (blind, as on /inventory/arrivals). Empty, never an
  // error, on a database without transfers.
  let incoming: { id: string; from: string; sentAt: string; note: string | null; lines: { itemId: string; item: string }[] }[] = [];
  try {
    const { data: transfers } = await db
      .from("stock_transfer")
      .select("id, sent_at, note, from:from_location_id(name)")
      .eq("business_id", device.businessId)
      .eq("to_location_id", device.locationId)
      .eq("status", "sent")
      .order("sent_at")
      .limit(20);
    const ids = (transfers ?? []).map((t) => t.id as string);
    if (ids.length) {
      const { data: tl } = await db.from("stock_transfer_line").select("transfer_id, item_id, item:item_id(name)").in("transfer_id", ids);
      const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
      incoming = (transfers ?? []).map((t) => ({
        id: t.id as string,
        from: one<{ name: string }>(t.from)?.name ?? "another place",
        sentAt: t.sent_at as string,
        note: (t.note as string | null) ?? null,
        lines: (tl ?? [])
          .filter((l) => l.transfer_id === t.id)
          .map((l) => ({ itemId: l.item_id as string, item: one<{ name: string }>(l.item)?.name ?? "A product" }))
          .sort((a, b) => a.item.localeCompare(b.item)),
      }));
    }
  } catch {
    incoming = [];
  }

  return NextResponse.json({
    incoming,
    businessId: device.businessId,
    locationId: device.locationId,
    label: device.label,
    businessName: (biz?.name as string | undefined) ?? null,
    locationName: (place?.name as string | undefined) ?? null,
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
      stockRule: item.stock_enforcement === "soft" || item.stock_enforcement === "hard" ? item.stock_enforcement : "none",
      barcode: item.barcode,
      category: item.category,
      photoUrl: item.photo_url ?? null,
    })),
  }, { headers: NO_STORE });
}

export const GET = withAuthority("pos/catalogue", "GET", handleGET);
