// "Worth promoting" (round 3, P3): up to three suggestions drawn from the
// business's own numbers. Each appears only when the numbers say so, and
// each links straight to a campaign for that thing.

import "server-only";

import { supabaseServer } from "@/lib/supabase";

export interface Suggestion {
  key: string;
  title: string;
  why: string;
  action: string;
  href: string;
  /** A paused campaign to resume instead of a new one. */
  resumeCampaignId?: string;
}

export async function loadSuggestions(businessId: string): Promise<Suggestion[]> {
  const db = supabaseServer();
  const now = Date.now();
  const since30 = new Date(now - 30 * 864e5).toISOString();
  const in7 = new Date(now + 7 * 864e5).toISOString();

  const [listings, campaigns, bookings, orderLines, saleLines, places, stock] = await Promise.all([
    db.from("discover_listing").select("id, item_id, status, item:item_id(name, kind, track_stock)").eq("business_id", businessId).eq("status", "eligible"),
    db.from("discover_campaign").select("id, listing_id, status, kind, place_ids").eq("business_id", businessId).in("status", ["running", "paused", "draft"]),
    db.from("service_booking").select("item_id").eq("business_id", businessId).gte("scheduled_start", new Date(now).toISOString()).lt("scheduled_start", in7).not("status", "in", "(cancelled,no_show)"),
    db.from("shop_order_line").select("item_id, quantity, order:order_id!inner(business_id, placed_at, status, location_id)").eq("order.business_id", businessId).gte("order.placed_at", since30).neq("order.status", "cancelled").limit(2000),
    db.from("sale_line").select("item_id, quantity, sale:sale_id!inner(business_id, occurred_at, location_id, status)").eq("sale.business_id", businessId).gte("sale.occurred_at", since30).eq("sale.status", "completed").limit(3000),
    db.from("location").select("id, name").eq("business_id", businessId).eq("active", true),
    db.from("stock_balance").select("item_id, quantity_on_hand").eq("business_id", businessId).is("variant_id", null).limit(3000),
  ]);

  const rows = (listings.data ?? []) as Array<Record<string, unknown>>;
  const promoted = new Set(((campaigns.data ?? []) as Array<Record<string, unknown>>).filter((c) => c.status !== "paused").map((c) => c.listing_id as string));
  const out: Suggestion[] = [];

  // 1. A service with a quiet week ahead.
  const booked = new Map<string, number>();
  for (const b of (bookings.data ?? []) as Array<{ item_id: string | null }>) if (b.item_id) booked.set(b.item_id, (booked.get(b.item_id) ?? 0) + 1);
  const services = rows
    .filter((l) => (l.item as { kind: string } | null)?.kind === "service" && !promoted.has(l.id as string))
    .map((l) => ({ l, n: booked.get(l.item_id as string) ?? 0 }))
    .filter((x) => x.n < 3)
    .sort((a, b) => a.n - b.n);
  if (services[0]) {
    const { l, n } = services[0];
    out.push({
      key: "service",
      title: (l.item as { name: string }).name,
      why: `${n === 0 ? "No bookings" : `${n} booking${n === 1 ? "" : "s"}`} in the next 7 days. A Service Boost fills quiet days.`,
      action: "Promote this service",
      href: `/promote/new?listing=${l.id}`,
    });
  }

  // 2. A product that sells and has stock to sell.
  const sold = new Map<string, number>();
  for (const r of (orderLines.data ?? []) as Array<{ item_id: string; quantity: number }>) sold.set(r.item_id, (sold.get(r.item_id) ?? 0) + Number(r.quantity));
  for (const r of (saleLines.data ?? []) as Array<{ item_id: string; quantity: number }>) sold.set(r.item_id, (sold.get(r.item_id) ?? 0) + Number(r.quantity));
  const onHand = new Map<string, number>();
  for (const s of (stock.data ?? []) as Array<{ item_id: string; quantity_on_hand: number }>) onHand.set(s.item_id, (onHand.get(s.item_id) ?? 0) + Number(s.quantity_on_hand));
  const products = rows
    .filter((l) => (l.item as { kind: string } | null)?.kind !== "service" && l.item_id && !promoted.has(l.id as string))
    .map((l) => {
      const item = l.item as { name: string; track_stock: boolean };
      return { l, item, n: sold.get(l.item_id as string) ?? 0, left: item.track_stock ? Math.floor(onHand.get(l.item_id as string) ?? 0) : null };
    })
    .filter((x) => x.n >= 3 && (x.left === null || x.left >= 10))
    .sort((a, b) => b.n - a.n);
  if (products[0]) {
    const { l, item, n, left } = products[0];
    out.push({
      key: "product",
      title: item.name,
      why: `Sold ${n} in the last 30 days${left !== null ? `, and ${left} are in stock` : ""}.`,
      action: "Promote this product",
      href: `/promote/new?listing=${l.id}`,
    });
  }

  // 3. The branch that sells least, when there is more than one.
  const placeList = (places.data ?? []) as Array<{ id: string; name: string }>;
  if (placeList.length > 1) {
    const by = new Map(placeList.map((p) => [p.id, 0]));
    for (const r of (orderLines.data ?? []) as unknown as Array<{ order: { location_id: string | null } }>) if (r.order?.location_id && by.has(r.order.location_id)) by.set(r.order.location_id, (by.get(r.order.location_id) ?? 0) + 1);
    for (const r of (saleLines.data ?? []) as unknown as Array<{ sale: { location_id: string | null } }>) if (r.sale?.location_id && by.has(r.sale.location_id)) by.set(r.sale.location_id, (by.get(r.sale.location_id) ?? 0) + 1);
    const quiet = placeList.slice().sort((a, b) => (by.get(a.id) ?? 0) - (by.get(b.id) ?? 0))[0];
    const paused = ((campaigns.data ?? []) as Array<Record<string, unknown>>).find(
      (c) => c.status === "paused" && c.kind === "location" && ((c.place_ids as string[] | null) ?? []).includes(quiet.id)
    );
    const shopListing = rows.find((l) => !l.item_id);
    if (paused || shopListing) {
      out.push({
        key: "location",
        title: `Your ${quiet.name} shop`,
        why: `Fewest sales of your ${placeList.length} places in 30 days.${paused ? " Resume the paused Location Boost." : " A Location Boost brings walk-ins."}`,
        action: paused ? "Resume campaign" : "Promote this branch",
        href: paused ? `/promote/${paused.id}` : `/promote/new?listing=${shopListing!.id}`,
        resumeCampaignId: paused ? (paused.id as string) : undefined,
      });
    }
  }
  return out;
}
