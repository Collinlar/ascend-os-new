import "server-only";

import { supabaseServer } from "@/lib/supabase";

// One customer (Modules M5): who they are, what they have spent and still
// owe, how often they come, whether they agreed to offers and the record
// of it, and one history across the till, the shop, bookings, documents,
// payments and the messages Ascend sent them. Each entry links to its own
// record where Ascend has a page for it.

export type HistoryKind = "sale" | "order" | "booking" | "document" | "payment" | "message";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  at: string;
  title: string;
  detail: string;
  amount: number | null;
  href: string | null;
  /** The product set it came from, as a tag. */
  from: string;
  tone: "teal" | "ok" | "warn" | "bad" | "info" | "mute";
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdVia: string;
  createdAt: string;
  marketingConsent: boolean;
  consent: { grantedAt: string | null; withdrawnAt: string | null; source: string | null } | null;
  figures: { spent: number; owed: number; visits: number; averageGapDays: number | null; lastSeen: string | null };
  history: HistoryEntry[];
  businessName: string;
}

const METHOD: Record<string, string> = { cash: "cash", mobile_money: "Mobile Money", card: "card", bank_transfer: "bank transfer", payment_link: "pay link" };
const TYPE: Record<string, string> = { quotation: "Quotation", proforma: "Proforma", invoice: "Invoice", receipt: "Receipt", credit_note: "Credit note", purchase_order: "Purchase order" };
const MESSAGE: Record<string, string> = {
  "document.issued": "Document sent",
  "document.issued.email": "Document emailed",
  "receipt.sent": "Receipt sent",
  "receipt.sent.email": "Receipt emailed",
  "invoice.reminder": "Payment reminder",
  "invoice.reminder.email": "Payment reminder emailed",
  "order.confirmed": "Order confirmation",
};
const BOOKING: Record<string, string> = {
  requested: "asked to book",
  quoted: "price sent",
  confirmed: "booked",
  in_progress: "happening",
  completed: "done",
  cancelled: "cancelled",
  no_show: "did not come",
};

export async function loadCustomerProfile(businessId: string, id: string): Promise<CustomerProfile | null> {
  const db = supabaseServer();
  const { data: c } = await db
    .from("customer")
    .select("id, display_name, phone_e164, email, created_via, created_at, marketing_consent")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!c) return null;

  const [summary, consent, sales, orders, bookings, documents, payments, messages, business] = await Promise.all([
    db.rpc("business_customers", { p_business: businessId, p_query: (c.phone_e164 as string | null) ?? (c.display_name as string) }),
    db.from("consent_record").select("granted_at, withdrawn_at, source").eq("business_id", businessId).eq("customer_id", id).eq("purpose", "marketing").order("granted_at", { ascending: false }).limit(1),
    db.from("sale").select("id, receipt_number, occurred_at, total, status, location:location_id(name)").eq("business_id", businessId).eq("customer_id", id).order("occurred_at", { ascending: false }).limit(60),
    db.from("shop_order").select("id, placed_at, total, status, fulfilment").eq("business_id", businessId).eq("customer_id", id).order("placed_at", { ascending: false }).limit(60),
    db.from("service_booking").select("id, scheduled_start, created_at, price_quoted, status, item:item_id(name), provider:assigned_membership_id(person:person_id(full_name))").eq("business_id", businessId).eq("customer_id", id).order("created_at", { ascending: false }).limit(60),
    db.from("document").select("id, type, number, issued_at, total, status, payment_id, source_entity_type").eq("business_id", businessId).eq("customer_id", id).not("number", "is", null).order("issued_at", { ascending: false }).limit(60),
    db.from("payment").select("id, amount, method, occurred_at, status, verification, source_entity_type, source_entity_id, reversal_of").eq("business_id", businessId).eq("customer_id", id)
      .neq("source_entity_type", "sale")
      .in("status", ["confirmed", "refunded"])
      .order("occurred_at", { ascending: false })
      .limit(60),
    db.from("message").select("id, template_key, status, created_at, channel, source_entity_type, source_entity_id").eq("business_id", businessId).eq("customer_id", id).order("created_at", { ascending: false }).limit(60),
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
  ]);

  const me = ((summary.data ?? []) as Array<{ id: string; spent: number | string; owed: number | string; last_seen: string | null }>).find((x) => x.id === id);
  const history: HistoryEntry[] = [];
  const money = (n: number) => `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  for (const s of sales.data ?? []) {
    history.push({
      id: `sale:${s.id}`,
      kind: "sale",
      at: s.occurred_at as string,
      title: s.status === "voided" || s.status === "refunded" ? `Sale ${s.status}` : "Bought at the counter",
      detail: [s.receipt_number ? `Receipt ${s.receipt_number}` : null, (s.location as unknown as { name: string } | null)?.name].filter(Boolean).join(" · "),
      amount: s.total === null ? null : Number(s.total),
      href: null,
      from: "Till",
      tone: "teal",
    });
  }
  for (const o of orders.data ?? []) {
    history.push({
      id: `order:${o.id}`,
      kind: "order",
      at: o.placed_at as string,
      title: `Shop order, ${String(o.status).replace(/_/g, " ")}`,
      detail: [`Order ${String(o.id).slice(0, 8).toUpperCase()}`, o.fulfilment ? String(o.fulfilment).replace(/_/g, " ") : null].filter(Boolean).join(" · "),
      amount: o.total === null ? null : Number(o.total),
      href: "/orders",
      from: "Shop",
      tone: "teal",
    });
  }
  for (const b of bookings.data ?? []) {
    const who = (b.provider as unknown as { person: { full_name: string } | null } | null)?.person?.full_name;
    history.push({
      id: `booking:${b.id}`,
      kind: "booking",
      at: ((b.scheduled_start as string | null) ?? (b.created_at as string)) as string,
      title: `${(b.item as unknown as { name: string } | null)?.name ?? "A service"}, ${BOOKING[b.status as string] ?? b.status}`,
      detail: [b.scheduled_start ? new Date(b.scheduled_start as string).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null, who ? `with ${who}` : null].filter(Boolean).join(" · "),
      amount: b.price_quoted === null ? null : Number(b.price_quoted),
      href: `/bookings/${b.id}`,
      from: "Services",
      tone: b.status === "no_show" || b.status === "cancelled" ? "bad" : b.status === "completed" ? "ok" : "teal",
    });
  }
  for (const d of documents.data ?? []) {
    // A receipt made for a till sale or a payment is the paper for an entry
    // already in the history; only a receipt issued by hand stands alone.
    if (d.type === "receipt" && (d.payment_id || d.source_entity_type === "sale")) continue;
    history.push({
      id: `doc:${d.id}`,
      kind: "document",
      at: (d.issued_at as string | null) ?? new Date(0).toISOString(),
      title: `${TYPE[d.type as string] ?? d.type} ${d.number}`,
      detail: String(d.status).replace(/_/g, " "),
      amount: d.total === null ? null : Number(d.total),
      href: `/documents/${d.id}`,
      from: "Documents",
      tone: d.status === "overdue" ? "warn" : "info",
    });
  }
  for (const p of payments.data ?? []) {
    const refund = p.status === "refunded" && p.reversal_of;
    history.push({
      id: `pay:${p.id}`,
      kind: "payment",
      at: p.occurred_at as string,
      title: refund ? `${money(Number(p.amount))} refunded` : `Paid ${money(Number(p.amount))} by ${METHOD[p.method as string] ?? p.method}`,
      detail:
        (p.source_entity_type === "document" ? "Against an invoice" : p.source_entity_type === "service_booking" ? "For a booking" : p.source_entity_type === "shop_order" ? "For a shop order" : "Payment") +
        (p.verification === "provider_confirmed" ? " · confirmed by the provider" : " · recorded by the business"),
      amount: Number(p.amount),
      href: p.source_entity_type === "document" ? `/documents/${p.source_entity_id}` : p.source_entity_type === "service_booking" ? `/bookings/${p.source_entity_id}` : null,
      from: "Payments",
      tone: refund ? "bad" : "ok",
    });
  }
  for (const m of messages.data ?? []) {
    const went = ["queued", "sent", "delivered", "read"].includes(m.status as string);
    history.push({
      id: `msg:${m.id}`,
      kind: "message",
      at: m.created_at as string,
      title: `${MESSAGE[m.template_key as string] ?? "Message"} ${m.channel === "email" ? "by email" : "on WhatsApp"}`,
      detail: went ? (m.status === "read" ? "Read" : m.status === "delivered" ? "Delivered" : "Sent") : "Did not go",
      amount: null,
      href: m.source_entity_type === "document" ? `/documents/${m.source_entity_id}` : null,
      from: "Messages",
      tone: went ? "info" : "mute",
    });
  }
  history.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Visits are the times they came: till sales, shop orders, and bookings
  // that happened. The gap is the average time between them.
  const visitDays = [
    ...(sales.data ?? []).filter((s) => s.status !== "voided").map((s) => s.occurred_at as string),
    ...(orders.data ?? []).filter((o) => !["cancelled", "rejected"].includes(o.status as string)).map((o) => o.placed_at as string),
    ...(bookings.data ?? []).filter((b) => ["completed", "in_progress", "confirmed"].includes(b.status as string)).map((b) => ((b.scheduled_start as string | null) ?? (b.created_at as string)) as string),
  ]
    .map((iso) => new Date(iso).getTime())
    .filter((t) => t <= Date.now())
    .sort((a, b) => a - b);
  const gaps = visitDays.slice(1).map((t, i) => (t - visitDays[i]) / 864e5);
  const consentRow = (consent.data ?? [])[0] as { granted_at: string | null; withdrawn_at: string | null; source: string | null } | undefined;

  return {
    id: c.id as string,
    name: c.display_name as string,
    phone: (c.phone_e164 as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    createdVia: (c.created_via as string) ?? "manual",
    createdAt: c.created_at as string,
    marketingConsent: Boolean(c.marketing_consent),
    consent: consentRow ? { grantedAt: consentRow.granted_at, withdrawnAt: consentRow.withdrawn_at, source: consentRow.source } : null,
    figures: {
      spent: Number(me?.spent ?? 0),
      owed: Number(me?.owed ?? 0),
      visits: visitDays.length,
      averageGapDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
      lastSeen: me?.last_seen && new Date(me.last_seen).getUTCFullYear() > 2000 ? me.last_seen : null,
    },
    history,
    businessName: (business.data?.name as string | undefined) ?? "us",
  };
}
