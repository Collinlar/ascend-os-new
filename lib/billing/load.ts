// Plans and billing (round 3, P4): what a business has and why, what it
// could add, what it has asked Ascend for, and what it has paid Ascend.
// Everything comes from the database; before 0149 the page shows what the
// older tables hold.

import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { loadBalance } from "@/lib/promote/load";

export type OfferMode = "buy" | "ask" | "coming";
export type Section = "run" | "packs" | "devices" | "grow" | "bundle" | "setup";

export interface Offer {
  id: string;
  sku: string;
  name: string;
  blurb: string;
  kind: string;
  amount: number;
  days: number | null;
  section: Section;
  mode: OfferMode;
  productSet: string | null;
  /** Running on the business now (bought, sponsored or given). */
  active: boolean;
  activeUntil: string | null;
}

export interface Holding {
  key: string;
  name: string;
  detail: string;
  /** Free, Paid, Sponsored, From Ascend, Offer */
  kind: string;
  until: string | null;
  endingSoon: boolean;
}

export interface Order {
  id: string;
  reference: string;
  kind: "purchase" | "top_up";
  sku: string | null;
  description: string;
  amount: number;
  status: "waiting" | "paid" | "cancelled";
  requestedAt: string;
  paidWith: string | null;
  recordedAt: string | null;
}

export interface Suggestion {
  key: string;
  title: string;
  kicker: string;
  why: string;
  what: string;
  price: string;
  priceNote: string;
  action: string;
  href: string;
}

export interface Manager {
  name: string;
  whatsapp: string;
}

export interface BillingData {
  ready: boolean;
  businessName: string;
  free: Holding[];
  paid: Holding[];
  offers: Offer[];
  orders: Order[];
  manager: Manager | null;
  paidThisYear: number;
  balance: Awaited<ReturnType<typeof loadBalance>>;
  plus: boolean;
  counts: { products: number; customers: number; services: number; places: number; people: number };
}

const FREE: Record<string, { name: string; detail: (c: BillingData["counts"]) => string }> = {
  pos: { name: "Mobile POS", detail: () => "Selling, receipts and sales history never need payment." },
  shop: { name: "Ascend Shop", detail: (c) => `${c.products} product${c.products === 1 ? "" : "s"} live. Your storefront and orders are free.` },
  documents: { name: "Documents basics", detail: () => "Quotes, invoices and receipts. The documents that build your business evidence stay free." },
  services: { name: "Services basics", detail: (c) => `${c.services} bookable service${c.services === 1 ? "" : "s"}. Booking and schedule.` },
  discover: { name: "Ascend Discover listing", detail: () => "Being found on Discover is free. Promotion is paid from your Balance." },
};

const SOURCE_KIND: Record<string, string> = {
  purchase: "Paid",
  sponsorship: "Sponsored",
  support_grant: "From Ascend",
  promotion: "Offer",
};

const SET_NAME: Record<string, string> = {
  office: "Office Team Pass",
  advanced_inventory: "Multi-location inventory",
  documents_plus: "Documents Plus",
  readiness: "Ascend Readiness",
};

const DAY = 864e5;
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", year: "numeric" });

export function ghs(n: number): string {
  return `GHS ${Math.round(n).toLocaleString("en-GB")}`;
}

export async function loadBilling(businessId: string): Promise<BillingData> {
  const db = supabaseServer();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const yearStart = `${new Date(now).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" }).slice(0, 4)}-01-01T00:00:00Z`;

  const fullBook = await db
    .from("price_book_entry")
    .select("id, sku, name, blurb, kind, amount, duration_days, section, offer_mode, product_set_key, sort, country_code")
    .eq("active", true)
    .order("sort");
  const ready = !fullBook.error;

  const [biz, grants, orders, manager, products, customers, services, places, people, balance] = await Promise.all([
    db.from("business").select("name, country_code").eq("id", businessId).maybeSingle(),
    db
      .from("entitlement")
      .select("product_set_key, source, starts_at, expires_at, grace_until, status, grant_reason, purchase:purchase_id(amount, created_at)")
      .eq("business_id", businessId)
      .in("status", ["active", "grace"])
      .not("product_set_key", "is", null)
      .lte("starts_at", nowIso),
    ready
      ? db.from("ascend_order").select("id, reference, kind, description, amount, status, requested_at, paid_with, recorded_at, entry:price_book_entry_id(sku)").eq("business_id", businessId).order("requested_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as unknown[] }),
    ready ? db.from("account_manager").select("name, whatsapp").eq("business_id", businessId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("channel_listing").select("item_id, item:item_id!inner(business_id, active)", { count: "exact", head: true }).eq("channel", "shop").eq("visible", true).eq("item.business_id", businessId).eq("item.active", true),
    db.from("customer").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    db.from("catalogue_item").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("kind", "service").eq("active", true),
    db.from("location").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("active", true),
    db.from("business_membership").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
    loadBalance(businessId),
  ]);

  const counts = {
    products: products.count ?? 0,
    customers: customers.count ?? 0,
    services: services.count ?? 0,
    places: places.count ?? 0,
    people: people.count ?? 0,
  };

  // In force the way business_entitlements (0069) decides it.
  const live = ((grants.data ?? []) as Array<Record<string, unknown>>).filter((g) => {
    const exp = g.expires_at as string | null;
    const grace = g.grace_until as string | null;
    return !exp || exp > nowIso || (grace !== null && grace > nowIso);
  });

  const free: Holding[] = [];
  const paidMap = new Map<string, Holding>();
  const runningUntil = new Map<string, string | null>();
  for (const g of live) {
    const key = g.product_set_key as string;
    const until = (g.expires_at as string | null) ?? null;
    const prev = runningUntil.get(key);
    if (!runningUntil.has(key) || (prev !== null && (until === null || until > (prev as string)))) runningUntil.set(key, until);
    if (g.source === "free_start") {
      const f = FREE[key];
      if (f && !free.some((x) => x.key === key)) free.push({ key, name: f.name, detail: "", kind: "Free", until: null, endingSoon: false });
      continue;
    }
    const purchase = g.purchase as { amount: number; created_at: string } | null;
    const detail =
      g.source === "purchase" && purchase
        ? `Bought ${dayLabel(purchase.created_at)} for ${ghs(Number(purchase.amount))}. We remind you 30 days before it ends. Nothing renews by itself.`
        : g.source === "sponsorship"
          ? "Paid for by your programme."
          : ((g.grant_reason as string) ?? "Given by the Ascend team.");
    const row: Holding = {
      key,
      name: SET_NAME[key] ?? key,
      detail,
      kind: SOURCE_KIND[g.source as string] ?? "From Ascend",
      until,
      endingSoon: until !== null && new Date(until).getTime() - now < 30 * DAY,
    };
    const had = paidMap.get(key);
    if (!had || (had.until !== null && (row.until === null || row.until > had.until))) paidMap.set(key, row);
  }
  for (const f of free) f.detail = FREE[f.key].detail(counts);
  free.push({ key: "crm", name: "CRM basics", detail: `${counts.customers.toLocaleString("en-GB")} customer${counts.customers === 1 ? "" : "s"}. Records, history and what they bought.`, kind: "Free", until: null, endingSoon: false });

  const country = (biz.data?.country_code as string) ?? "GH";
  const offers: Offer[] = ready
    ? ((fullBook.data ?? []) as Array<Record<string, unknown>>)
        .filter((o) => o.country_code === country && o.section)
        .map((o) => {
          const set = (o.product_set_key as string) ?? null;
          return {
            id: o.id as string,
            sku: o.sku as string,
            name: o.name as string,
            blurb: (o.blurb as string) ?? "",
            kind: o.kind as string,
            amount: Number(o.amount),
            days: (o.duration_days as number) ?? null,
            section: o.section as Section,
            mode: o.offer_mode as OfferMode,
            productSet: set,
            active: set !== null && runningUntil.has(set),
            activeUntil: set !== null ? (runningUntil.get(set) ?? null) : null,
          };
        })
    : [];

  const orderRows: Order[] = ((orders.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: o.id as string,
    reference: o.reference as string,
    kind: o.kind as "purchase" | "top_up",
    sku: (o.entry as { sku: string } | null)?.sku ?? null,
    description: o.description as string,
    amount: Number(o.amount),
    status: o.status as Order["status"],
    requestedAt: o.requested_at as string,
    paidWith: (o.paid_with as string) ?? null,
    recordedAt: (o.recorded_at as string) ?? null,
  }));
  const paidThisYear = orderRows.filter((o) => o.status === "paid" && (o.recordedAt ?? "") >= yearStart).reduce((n, o) => n + o.amount, 0);

  return {
    ready,
    businessName: (biz.data?.name as string) ?? "Your business",
    free,
    paid: Array.from(paidMap.values()).sort((a, b) => Number(b.endingSoon) - Number(a.endingSoon)),
    offers,
    orders: orderRows,
    manager: (manager.data as Manager | null) ?? null,
    paidThisYear,
    balance,
    plus: runningUntil.has("documents_plus"),
    counts,
  };
}

/**
 * Suggestions from the business's own numbers, each for something Ascend
 * can switch on today. A dismissed one stays dismissed.
 */
export async function loadBillingSuggestions(businessId: string, data: BillingData): Promise<Suggestion[]> {
  if (!data.ready) return [];
  const db = supabaseServer();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const since14 = new Date(Date.now() - 14 * DAY).toISOString();
  const [dismissed, docs, sales, places] = await Promise.all([
    db.from("billing_suggestion_dismissal").select("suggestion_key").eq("business_id", businessId),
    db.from("document").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("type", ["invoice", "quotation", "proforma"]).gte("issued_at", since30),
    db.from("sale").select("location_id").eq("business_id", businessId).eq("status", "completed").gte("occurred_at", since14).limit(5000),
    db.from("location").select("id, name").eq("business_id", businessId).eq("active", true),
  ]);
  const gone = new Set(((dismissed.data ?? []) as Array<{ suggestion_key: string }>).map((d) => d.suggestion_key));
  const offer = (sku: string) => data.offers.find((o) => o.sku === sku);
  const out: Suggestion[] = [];

  const plus = offer("documents_plus_12m");
  const issued = docs.count ?? 0;
  if (plus && !plus.active && issued >= 5 && !gone.has("documents_plus")) {
    out.push({
      key: "documents_plus",
      kicker: "Documents Plus",
      title: "Your logo and colour on every invoice",
      why: `You issued ${issued} quotes and invoices in the last 30 days, all with the standard look.`,
      what: "Your logo, your colour, the Modern or Compact template and your own numbering, on everything you send.",
      price: ghs(plus.amount),
      priceNote: "for 12 months",
      action: "Get Documents Plus",
      href: `/billing/get/${plus.sku}`,
    });
  }

  const inv = offer("advanced_inventory_12m");
  if (inv && !inv.active && data.counts.places >= 2 && !gone.has("multi_location")) {
    out.push({
      key: "multi_location",
      kicker: "Multi-location inventory",
      title: "Move stock between your places",
      why: `You have ${data.counts.places} places, each with its own stock.`,
      what: "Send stock from one place and receive it at another, and see what each branch holds.",
      price: ghs(inv.amount),
      priceNote: "for 12 months",
      action: "Get Multi-location inventory",
      href: `/billing/get/${inv.sku}`,
    });
  }

  const team = data.offers.filter((o) => o.productSet === "office" && o.mode === "buy").sort((a, b) => a.amount - b.amount);
  if (team.length && !team[0].active && data.counts.people >= 3 && !gone.has("office_pass")) {
    const band = data.counts.people <= 5 ? team[0] : data.counts.people <= 15 ? (team[1] ?? team[0]) : (team[2] ?? team[team.length - 1]);
    out.push({
      key: "office_pass",
      kicker: "Office Team Pass",
      title: "Approvals, attendance and leave in one place",
      why: `${data.counts.people} people work in your business on Ascend.`,
      what: "Give work out, approve requests, and see who is in, all from Office.",
      price: ghs(band.amount),
      priceNote: "for 12 months",
      action: "Get the Team Pass",
      href: `/billing/get/${band.sku}`,
    });
  }

  // A busy counter on a phone: a Counter Register is arranged with Ascend.
  const reg = offer("counter_register");
  if (reg) {
    const per = new Map<string, number>();
    for (const s of (sales.data ?? []) as Array<{ location_id: string }>) per.set(s.location_id, (per.get(s.location_id) ?? 0) + 1);
    const busiest = ((places.data ?? []) as Array<{ id: string; name: string }>)
      .map((p) => ({ p, perDay: Math.round((per.get(p.id) ?? 0) / 14) }))
      .sort((a, b) => b.perDay - a.perDay)[0];
    if (busiest && busiest.perDay >= 60 && !gone.has(`counter:${busiest.p.id}`)) {
      out.push({
        key: `counter:${busiest.p.id}`,
        kicker: "Counter Register",
        title: `A full till for ${busiest.p.name}`,
        why: `${busiest.p.name} handles about ${busiest.perDay} sales a day on a phone.`,
        what: "A till with a cash drawer and scanner, with your catalogue already loaded.",
        price: ghs(reg.amount),
        priceNote: "one-time, device",
        action: data.manager ? `Ask ${data.manager.name}` : "Ask Ascend",
        href: "ask",
      });
    }
  }
  return out;
}

export function ascendWhatsApp(manager: Manager | null, text: string): string | null {
  const number = manager?.whatsapp ?? process.env["ASCEND_SUPPORT_WHATSAPP"] ?? "";
  const digits = number.replace(/[^\d]/g, "");
  return digits.length >= 9 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export function bankDetails(): string | null {
  const v = process.env["ASCEND_BANK_DETAILS"];
  return v && v.trim() ? v.trim() : null;
}
