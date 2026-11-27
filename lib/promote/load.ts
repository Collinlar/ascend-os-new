// What the Promotions pages show (round 3, P1): campaigns with reach and
// what they brought in, the business's totals, and the Ascend Balance with
// its own money and sponsored credit kept apart.

import "server-only";

import { supabaseServer } from "@/lib/supabase";

export interface CampaignFigures {
  id: string;
  status: string;
  budget: number;
  spent: number;
  costPerClick: number;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  listingId: string;
  listingStatus: string;
  city: string | null;
  category: string | null;
  itemName: string | null;
  itemKind: string | null;
  /** New campaigns (round 3, P2): what kind of boost, the day's budget,
   *  the length, and where review stands. */
  kind: string | null;
  dailyBudget: number | null;
  days: number | null;
  reviewStatus: string;
  reviewNote: string | null;
  seen: number;
  clicks: number;
  visits: number;
  orders: number;
  bookings: number;
  sales: number;
  spentPeriod: number;
}

export interface PromotionTotals {
  seen: number;
  clicks: number;
  visits: number;
  orders: number;
  bookings: number;
  sales: number;
  spent: number;
}

export interface BalanceSplit {
  total: number;
  /** The business's own money, usable for promotion. */
  own: number;
  /** Sponsored credit still left for promotion; used before own money. */
  sponsored: number;
  sponsor: { name: string; until: string | null; given: number; givenAt: string } | null;
  entries: Array<{ id: string; at: string; kind: string; amount: number; what: string; after: number }>;
}

/** The design's name for what a campaign promotes. */
export function campaignType(c: Pick<CampaignFigures, "itemKind" | "itemName"> & { kind?: string | null }): string {
  if (c.kind === "location") return "Location Boost";
  if (c.kind === "shop") return "Shop Boost";
  if (c.kind === "service") return "Service Boost";
  if (c.kind === "product") return "Product Boost";
  if (!c.itemName) return "Shop Boost";
  return c.itemKind === "service" ? "Service Boost" : "Product Boost";
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function loadPromotionFigures(businessId: string, days = 30): Promise<{ totals: PromotionTotals; campaigns: CampaignFigures[]; traced: boolean } | null> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("promotion_figures", { p_business: businessId, p_days: days });
  if (error || !data) return fallbackFigures(businessId);
  const raw = data as { totals: Record<string, unknown>; campaigns: Array<Record<string, unknown>> };
  return {
    traced: true,
    totals: {
      seen: n(raw.totals.seen),
      clicks: n(raw.totals.clicks),
      visits: n(raw.totals.visits),
      orders: n(raw.totals.orders),
      bookings: n(raw.totals.bookings),
      sales: n(raw.totals.sales),
      spent: n(raw.totals.spent),
    },
    campaigns: raw.campaigns.map((c) => ({
      id: c.id as string,
      status: c.status as string,
      budget: n(c.budget),
      spent: n(c.spent),
      costPerClick: n(c.cost_per_click),
      startsAt: c.starts_at as string,
      endsAt: (c.ends_at as string) ?? null,
      createdAt: c.created_at as string,
      listingId: c.listing_id as string,
      listingStatus: c.listing_status as string,
      city: (c.city as string) ?? null,
      category: (c.category as string) ?? null,
      itemName: (c.item_name as string) ?? null,
      itemKind: (c.item_kind as string) ?? null,
      kind: (c.kind as string) ?? null,
      dailyBudget: c.daily_budget === null || c.daily_budget === undefined ? null : n(c.daily_budget),
      days: c.days === null || c.days === undefined ? null : n(c.days),
      reviewStatus: (c.review_status as string) ?? "approved",
      reviewNote: (c.review_note as string) ?? null,
      seen: n(c.seen),
      clicks: n(c.clicks),
      visits: n(c.visits),
      orders: n(c.orders),
      bookings: n(c.bookings),
      sales: n(c.sales),
      spentPeriod: n(c.spent_period),
    })),
  };
}

const WHAT: Record<string, string> = {
  top_up: "Top-up",
  sponsor_credit: "Sponsored credit",
  promo_credit: "Credit from Ascend",
  reversal: "Refund to Balance",
};

/**
 * The Balance as the design shows it. Spending is not recorded against one
 * pot or the other, so the split follows the rule the page states:
 * sponsored credit is used first, for what it may be spent on, until it
 * runs out or ends.
 */
export async function loadBalance(businessId: string): Promise<BalanceSplit> {
  const db = supabaseServer();
  const { data } = await db
    .from("balance_entry")
    .select("id, kind, amount, service_key, created_at, restricted_to, sponsorship:sponsorship_id(ends_at, institution:institution_id(name))")
    .eq("business_id", businessId)
    .order("created_at")
    .limit(2000);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const forPromotion = (r: Record<string, unknown>) => {
    const allowed = r.restricted_to as string[] | null;
    return !allowed || allowed.some((a) => "discover.click".startsWith(a) || a.startsWith("discover"));
  };

  let running = 0;
  const entries: BalanceSplit["entries"] = [];
  let sponsoredIn = 0;
  let promoSpend = 0;
  let sponsor: BalanceSplit["sponsor"] = null;
  for (const r of rows) {
    const amount = n(r.amount);
    running += amount;
    const kind = r.kind as string;
    const sp = r.sponsorship as { ends_at: string | null; institution: { name: string } | null } | null;
    if ((kind === "sponsor_credit" || kind === "promo_credit") && forPromotion(r) && (!sp?.ends_at || sp.ends_at >= today)) {
      sponsoredIn += amount;
      if (kind === "sponsor_credit") {
        sponsor = { name: sp?.institution?.name ?? "A programme", until: sp?.ends_at ?? null, given: amount, givenAt: r.created_at as string };
      }
    }
    if (kind === "deduction" && (r.service_key as string | null)?.startsWith("discover")) promoSpend += -amount;
    const what = kind === "deduction" ? ((r.service_key as string | null)?.startsWith("discover") ? "Discover promotion" : "Ascend service") : WHAT[kind] ?? kind;
    const day = new Date(r.created_at as string).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
    const last = entries[entries.length - 1];
    // Promotion is charged click by click: one line a day is what a person reads.
    if (kind === "deduction" && last && last.kind === "deduction" && last.what === what && last.at.slice(0, 10) === day) {
      last.amount = Math.round((last.amount + amount) * 100) / 100;
      last.after = Math.round(running * 100) / 100;
      continue;
    }
    entries.push({
      id: r.id as string,
      at: kind === "deduction" ? day : (r.created_at as string),
      kind,
      amount,
      what,
      after: Math.round(running * 100) / 100,
    });
  }
  const total = Math.round(running * 100) / 100;
  const sponsored = Math.max(0, Math.min(total, Math.round((sponsoredIn - promoSpend) * 100) / 100));
  return {
    total,
    own: Math.max(0, Math.round((total - sponsored) * 100) / 100),
    sponsored,
    sponsor: sponsored > 0 ? sponsor : null,
    entries: entries.reverse(),
  };
}

// Before 0146 there is no promotion_figures: the campaigns still show, with
// what campaign_performance (0026) knows, and nothing traced past a click.
async function fallbackFigures(businessId: string): Promise<{ totals: PromotionTotals; campaigns: CampaignFigures[]; traced: boolean } | null> {
  const db = supabaseServer();
  const [{ data: rows }, { data: perf }] = await Promise.all([
    db
      .from("discover_campaign")
      .select("id, status, budget, spent, cost_per_click, starts_at, ends_at, created_at, listing:listing_id(id, status, city, category, item:item_id(name, kind))")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    db.rpc("campaign_performance", { p_business: businessId }),
  ]);
  const by = new Map(((perf ?? []) as Array<Record<string, unknown>>).map((p) => [p.campaign_id as string, p]));
  const campaigns: CampaignFigures[] = ((rows ?? []) as Array<Record<string, unknown>>).map((c) => {
    const l = c.listing as { id: string; status: string; city: string | null; category: string | null; item: { name: string; kind: string } | null } | null;
    const p = by.get(c.id as string) ?? {};
    return {
      id: c.id as string,
      status: c.status as string,
      budget: n(c.budget),
      spent: n(c.spent),
      costPerClick: n(c.cost_per_click),
      startsAt: c.starts_at as string,
      endsAt: (c.ends_at as string) ?? null,
      createdAt: c.created_at as string,
      listingId: l?.id ?? "",
      listingStatus: l?.status ?? "eligible",
      city: l?.city ?? null,
      category: l?.category ?? null,
      itemName: l?.item?.name ?? null,
      itemKind: l?.item?.kind ?? null,
      kind: null,
      dailyBudget: null,
      days: null,
      reviewStatus: "approved",
      reviewNote: null,
      seen: n(p.impressions),
      clicks: n(p.clicks),
      visits: 0,
      orders: n(p.orders),
      bookings: n(p.bookings),
      sales: 0,
      spentPeriod: n(c.spent),
    };
  });
  const sum = (k: keyof CampaignFigures) => campaigns.reduce((t, c) => t + (c[k] as number), 0);
  return {
    traced: false,
    totals: { seen: sum("seen"), clicks: sum("clicks"), visits: 0, orders: sum("orders"), bookings: sum("bookings"), sales: 0, spent: sum("spent") },
    campaigns,
  };
}
