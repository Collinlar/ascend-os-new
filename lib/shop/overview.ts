import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { isLow, isOut, stockLevels } from "@/lib/domains/inventory";

// The Shop overview (Modules M6a): whether the shop is live and trusted,
// the last 30 days in four figures, what is selling, what Discover brought,
// and what is waiting. Every figure is read from orders and payments;
// nothing here is estimated. Visits to the storefront are not tracked, so
// there is no visit-to-paid funnel (M6, decision 3).

const DAY = 864e5;
const LIVE = ["confirmed", "preparing", "ready", "out_for_delivery", "fulfilled"];

export interface ShopOverview {
  slug: string | null;
  listed: number;
  sellable: number;
  verified: boolean;
  places: number;
  figures: {
    sales30: number;
    salesPrev30: number;
    orders30: number;
    waiting: number;
    paid30: number;
    toCollect: number;
    repeatShare: number | null;
    shopCustomers: number;
  };
  selling: Array<{ itemId: string; name: string; price: number | null; sold: number; stock: "low" | "out" | null; left: number | null }>;
  discover: { visits30: number; clicks30: number; listed: boolean };
  waitingFor: { confirm: number; pack: number; readyPickup: number; delivering: number; notPaid: number; problems: number };
}

export async function loadShopOverview(businessId: string): Promise<ShopOverview> {
  const db = supabaseServer();
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const before = new Date(Date.now() - 60 * DAY).toISOString();

  const [biz, listed, sellable, orders, places, listing] = await Promise.all([
    db.from("business").select("shop_slug, identity_verification").eq("id", businessId).maybeSingle(),
    db
      .from("catalogue_item")
      .select("id, channel_listing!inner(channel, visible)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true)
      .eq("channel_listing.channel", "shop")
      .eq("channel_listing.visible", true),
    db.from("catalogue_item").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("active", true).not("base_price", "is", null),
    db
      .from("shop_order")
      .select("id, status, total, placed_at, customer_id, fulfilment, shop_order_line(item_id, description, quantity, unit_price)")
      .eq("business_id", businessId)
      .gte("placed_at", before)
      .limit(2000),
    db.from("location").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("active", true),
    db.from("discover_listing").select("id, status").eq("business_id", businessId),
  ]);

  // Problems customers reported on orders, waiting for the shop's answer
  // before Ascend reads them (R5). Zero before 0145.
  const { count: problems } = await db
    .from("customer_report")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "with_shop");

  const rows = orders.data ?? [];
  const recent = rows.filter((o) => (o.placed_at as string) >= since);
  const prev = rows.filter((o) => (o.placed_at as string) < since);
  const live = (o: (typeof rows)[number]) => LIVE.includes(o.status as string);

  // Money paid against shop orders (pay links and money taken on the day,
  // 0141), less refunds.
  const ids = rows.map((o) => o.id as string);
  const paidBy = new Map<string, number>();
  let paid30 = 0;
  if (ids.length) {
    const { data: pays } = await db
      .from("payment")
      .select("source_entity_id, amount, status, reversal_of, occurred_at")
      .eq("business_id", businessId)
      .eq("source_entity_type", "shop_order")
      .in("source_entity_id", ids)
      .in("status", ["confirmed", "refunded"]);
    for (const p of pays ?? []) {
      const sign = p.status === "confirmed" && !p.reversal_of ? 1 : p.status === "refunded" && p.reversal_of ? -1 : 0;
      paidBy.set(p.source_entity_id as string, (paidBy.get(p.source_entity_id as string) ?? 0) + sign * Number(p.amount));
      if (sign !== 0 && (p.occurred_at as string) >= since) paid30 += sign * Number(p.amount);
    }
  }
  const left = (o: (typeof rows)[number]) => Math.max(0, Number(o.total ?? 0) - (paidBy.get(o.id as string) ?? 0));

  // Repeat buyers: shop customers with more than one live order, ever in
  // these 60 days.
  const per = new Map<string, number>();
  for (const o of rows.filter(live)) if (o.customer_id) per.set(o.customer_id as string, (per.get(o.customer_id as string) ?? 0) + 1);
  const buyers = Array.from(per.values());

  // What sold most in 30 days, with its stock where it is counted.
  const sold = new Map<string, { name: string; qty: number; price: number | null }>();
  for (const o of recent.filter(live)) {
    for (const l of (o.shop_order_line ?? []) as Array<{ item_id: string; description: string; quantity: number; unit_price: number }>) {
      const s = sold.get(l.item_id) ?? { name: l.description, qty: 0, price: Number(l.unit_price) };
      s.qty += Number(l.quantity);
      sold.set(l.item_id, s);
    }
  }
  const top = Array.from(sold, ([itemId, s]) => ({ itemId, ...s })).sort((a, b) => b.qty - a.qty).slice(0, 5);
  let stock = new Map<string, { low: boolean; out: boolean; left: number }>();
  if (top.length) {
    try {
      const levels = await stockLevels(businessId);
      stock = new Map(levels.lines.filter((l) => l.tracked).map((l) => [l.itemId, { low: isLow(l), out: isOut(l), left: l.available }]));
    } catch {
      // Stock is a nicety on this card; the sales stand without it.
    }
  }

  // Discover, its own events only (they are reach, never evidence).
  const listingIds = (listing.data ?? []).map((l) => l.id as string);
  let visits30 = 0;
  let clicks30 = 0;
  if (listingIds.length) {
    const { data: ev } = await db.from("discover_event").select("interaction").in("listing_id", listingIds).gte("occurred_at", since).in("interaction", ["visit", "click"]).limit(5000);
    for (const e of ev ?? []) {
      if (e.interaction === "visit") visits30 += 1;
      else clicks30 += 1;
    }
  }

  const open = rows.filter((o) => ["pending", "confirmed", "preparing", "ready", "out_for_delivery"].includes(o.status as string) || (o.status === "fulfilled" && left(o) > 0.005));
  return {
    slug: (biz.data?.shop_slug as string | null) ?? null,
    listed: listed.count ?? 0,
    sellable: sellable.count ?? 0,
    verified: biz.data?.identity_verification === "verified",
    places: places.count ?? 0,
    figures: {
      sales30: recent.filter(live).reduce((n, o) => n + Number(o.total ?? 0), 0),
      salesPrev30: prev.filter(live).reduce((n, o) => n + Number(o.total ?? 0), 0),
      orders30: recent.filter(live).length,
      waiting: recent.filter((o) => o.status === "pending").length,
      paid30,
      toCollect: rows.filter(live).reduce((n, o) => n + left(o), 0),
      repeatShare: buyers.length ? Math.round((buyers.filter((n) => n > 1).length / buyers.length) * 100) : null,
      shopCustomers: buyers.length,
    },
    selling: top.map((t) => {
      const s = stock.get(t.itemId);
      return { itemId: t.itemId, name: t.name, price: t.price, sold: t.qty, stock: s ? (s.out ? "out" : s.low ? "low" : null) : null, left: s ? s.left : null };
    }),
    discover: { visits30, clicks30, listed: (listing.data ?? []).some((l) => l.status === "eligible") },
    waitingFor: {
      confirm: open.filter((o) => o.status === "pending").length,
      pack: open.filter((o) => o.status === "confirmed" || o.status === "preparing").length,
      readyPickup: open.filter((o) => o.status === "ready" && o.fulfilment === "pickup").length,
      delivering: open.filter((o) => o.status === "out_for_delivery" || (o.status === "ready" && o.fulfilment !== "pickup")).length,
      notPaid: open.filter((o) => o.status === "fulfilled").length,
      problems: problems ?? 0,
    },
  };
}
