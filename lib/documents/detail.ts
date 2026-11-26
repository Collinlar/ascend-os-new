import "server-only";

import { supabaseServer } from "@/lib/supabase";

// One document, with everything that has happened to it (Modules M3): what
// it says, what has been paid and credited against it, the documents it came
// from and became, the reminders sent, and its evidence trail. The trail is
// built from the records themselves (issued, sent, seen, paid, credited,
// reminded), so it can never claim something the books do not show.

export interface DocLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DocPayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  verification: string;
  reference: string | null;
  at: string;
  byName: string | null;
  receipt: { id: string; number: string | null } | null;
}

export interface RelatedDoc {
  id: string;
  type: string;
  number: string | null;
  status: string;
  total: number | null;
  /** came_from: the one this was made from; became: made from this one. */
  relation: "came_from" | "became";
}

export interface TrailEntry {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: "teal" | "ok" | "warn" | "bad" | "info" | "mute";
}

export interface DocumentDetail {
  id: string;
  businessId: string;
  businessName: string;
  branding: { tradingName: string | null; addressLine: string | null; phone: string | null; footerNote: string | null };
  type: string;
  status: string;
  number: string | null;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  lines: DocLine[];
  createdAt: string;
  issuedAt: string | null;
  dueDate: string | null;
  validUntil: string | null;
  sourceType: string | null;
  sourceId: string | null;
  party: { kind: "customer" | "supplier"; name: string | null; phone: string | null; email: string | null; customerId: string | null };
  amounts: { paid: number; credited: number; outstanding: number };
  payments: DocPayment[];
  related: RelatedDoc[];
  reminders: Array<{ sequence: number; sentAt: string; status: string | null }>;
  views: { first: string | null; count: number };
  trail: TrailEntry[];
  /** The invoice this receipt was paid against, for a receipt made by a payment. */
  paidInvoice: { id: string; number: string | null } | null;
}

const METHOD: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank transfer",
  card: "Card",
  payment_link: "Pay link",
  credit: "Credit",
  balance: "Balance",
};

export function methodLabel(m: string): string {
  return METHOD[m] ?? m;
}

const TYPE: Record<string, string> = {
  quotation: "Quotation",
  proforma: "Proforma",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
  purchase_order: "Purchase order",
  delivery_note: "Delivery note",
};

export function typeLabel(t: string): string {
  return TYPE[t] ?? t.replace(/_/g, " ");
}

export async function loadDocumentDetail(businessId: string, id: string): Promise<DocumentDetail | null> {
  const db = supabaseServer();
  const { data: d } = await db
    .from("document")
    .select(
      "id, business_id, type, status, number, currency_code, subtotal, tax_total, total, lines, created_at, issued_at, due_date, valid_until, source_entity_type, source_entity_id, converted_from, payment_id, customer_id, customer:customer_id(display_name, phone_e164, email), supplier:supplier_id(name, phone_e164)"
    )
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!d) return null;

  const [business, branding, amounts, payments, children, parent, reminders, tokens, sent] = await Promise.all([
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
    db.from("document_branding").select("trading_name, address_line, phone, footer_note").eq("business_id", businessId).maybeSingle(),
    db.rpc("document_amounts", { p_document: id }),
    db
      .from("payment")
      .select("id, amount, method, status, verification, provider_reference, occurred_at, reversal_of, actor:actor_membership_id(person:person_id(full_name))")
      .eq("business_id", businessId)
      .eq("source_entity_type", "document")
      .eq("source_entity_id", id)
      .order("occurred_at", { ascending: true }),
    db.from("document").select("id, type, number, status, total, issued_at, created_at").eq("business_id", businessId).eq("converted_from", id),
    d.converted_from
      ? db.from("document").select("id, type, number, status, total").eq("id", d.converted_from as string).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("document_reminder").select("sequence, sent_at, message:message_id(status)").eq("document_id", id).order("sent_at", { ascending: true }),
    db.from("document_access_token").select("first_viewed_at, view_count").eq("document_id", id),
    db
      .from("message")
      .select("template_key, status, created_at, sent_at, channel")
      .eq("business_id", businessId)
      .eq("source_entity_type", "document")
      .eq("source_entity_id", id)
      .in("template_key", ["document.issued", "document.issued.email", "receipt.sent", "receipt.sent.email"])
      .order("created_at", { ascending: true }),
  ]);

  // Receipts made for each payment (0052).
  const payRows = (payments.data ?? []).filter((p) => !p.reversal_of);
  const receipts = new Map<string, { id: string; number: string | null }>();
  if (payRows.length > 0) {
    const { data: rc } = await db
      .from("document")
      .select("id, number, payment_id")
      .in("payment_id", payRows.map((p) => p.id as string));
    for (const r of rc ?? []) receipts.set(r.payment_id as string, { id: r.id as string, number: (r.number as string | null) ?? null });
  }
  // A receipt made by a payment points back at its invoice.
  let paidInvoice: DocumentDetail["paidInvoice"] = null;
  if (d.payment_id) {
    const { data: pay } = await db.from("payment").select("source_entity_type, source_entity_id").eq("id", d.payment_id as string).maybeSingle();
    if (pay?.source_entity_type === "document") {
      const { data: inv } = await db.from("document").select("id, number").eq("id", pay.source_entity_id as string).maybeSingle();
      if (inv) paidInvoice = { id: inv.id as string, number: (inv.number as string | null) ?? null };
    }
  }

  const customer = d.customer as unknown as { display_name: string | null; phone_e164: string | null; email: string | null } | null;
  const supplier = d.supplier as unknown as { name: string | null; phone_e164: string | null } | null;
  const am = ((amounts.data ?? []) as Array<{ paid: number | string; credited: number | string; outstanding: number | string }>)[0];
  const lines: DocLine[] = (Array.isArray(d.lines) ? (d.lines as Array<Record<string, unknown>>) : []).map((l) => ({
    description: String(l.description ?? ""),
    quantity: Number(l.quantity ?? 0),
    unitPrice: Number(l.unit_price ?? 0),
    lineTotal: Number(l.line_total ?? Number(l.quantity ?? 0) * Number(l.unit_price ?? 0)),
  }));

  const docPayments: DocPayment[] = payRows.map((p) => ({
    id: p.id as string,
    amount: Number(p.amount),
    method: p.method as string,
    status: p.status as string,
    verification: p.verification as string,
    reference: (p.provider_reference as string | null) ?? null,
    at: p.occurred_at as string,
    byName: (p.actor as unknown as { person: { full_name: string | null } | null } | null)?.person?.full_name ?? null,
    receipt: receipts.get(p.id as string) ?? null,
  }));

  const related: RelatedDoc[] = [
    ...(parent.data ? [{ ...(parent.data as { id: string; type: string; number: string | null; status: string; total: number | null }), relation: "came_from" as const }] : []),
    ...(children.data ?? []).map((c) => ({
      id: c.id as string,
      type: c.type as string,
      number: (c.number as string | null) ?? null,
      status: c.status as string,
      total: c.total === null ? null : Number(c.total),
      relation: "became" as const,
    })),
  ];

  const views = (tokens.data ?? []).reduce(
    (acc, t) => ({
      first: t.first_viewed_at && (!acc.first || (t.first_viewed_at as string) < acc.first) ? (t.first_viewed_at as string) : acc.first,
      count: acc.count + Number(t.view_count ?? 0),
    }),
    { first: null as string | null, count: 0 }
  );

  const reminderRows = (reminders.data ?? []).map((r) => ({
    sequence: Number(r.sequence),
    sentAt: r.sent_at as string,
    status: (r.message as unknown as { status: string } | null)?.status ?? null,
  }));

  // ------------------------------------------------------------ the trail --
  const money = (n: number) => `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const trail: TrailEntry[] = [];
  trail.push({ id: "made", at: d.created_at as string, title: d.number ? "Drafted" : "Drafted, not sent out yet", tone: "mute" });
  const from = related.find((r) => r.relation === "came_from");
  if (from) trail.push({ id: "from", at: d.created_at as string, title: `Made from ${typeLabel(from.type).toLowerCase()} ${from.number ?? ""}`.trim(), tone: "teal" });
  if (d.issued_at) trail.push({ id: "issued", at: d.issued_at as string, title: `Issued as ${d.number}`, detail: "Its number and contents are fixed from here", tone: "teal" });
  for (const m of sent.data ?? []) {
    const ok = ["sent", "delivered", "read", "queued"].includes(m.status as string);
    trail.push({
      id: `msg:${m.created_at}:${m.template_key}`,
      at: (m.sent_at as string | null) ?? (m.created_at as string),
      title: ok
        ? `${m.status === "read" ? "Read" : m.status === "delivered" ? "Delivered" : "Sent"} on ${m.channel === "email" ? "email" : "WhatsApp"}`
        : `Not sent on ${m.channel === "email" ? "email" : "WhatsApp"}`,
      detail: ok ? undefined : m.status === "blocked_no_balance" ? "Ascend Balance ran out" : m.status === "blocked_no_consent" ? "No consent to message them" : "The message did not go",
      tone: ok ? "info" : "warn",
    });
  }
  if (views.first) trail.push({ id: "seen", at: views.first, title: "Opened by the customer", detail: views.count > 1 ? `${views.count} times in all` : undefined, tone: "info" });
  for (const r of reminderRows) trail.push({ id: `rem:${r.sequence}`, at: r.sentAt, title: `Reminder ${r.sequence} sent`, tone: "warn" });
  for (const p of docPayments) {
    trail.push({
      id: `pay:${p.id}`,
      at: p.at,
      title: `${money(p.amount)} received by ${methodLabel(p.method)}`,
      detail: [
        p.verification === "provider_confirmed" ? "Confirmed by the provider" : `Recorded by ${p.byName ?? "the business"}`,
        p.reference ? `ref ${p.reference}` : null,
        p.receipt?.number ? `receipt ${p.receipt.number}` : null,
      ]
        .filter(Boolean)
        .join(", "),
      tone: "ok",
    });
  }
  for (const c of related.filter((r) => r.relation === "became")) {
    const child = (children.data ?? []).find((x) => x.id === c.id);
    trail.push({
      id: `became:${c.id}`,
      at: ((child?.issued_at as string | null) ?? (child?.created_at as string)) || (d.created_at as string),
      title: c.type === "credit_note" ? `Credit note ${c.number ?? ""} issued`.replace("  ", " ") : `Turned into ${typeLabel(c.type).toLowerCase()} ${c.number ?? "(draft)"}`,
      detail: c.total !== null ? money(Math.abs(c.total)) : undefined,
      tone: c.type === "credit_note" ? "bad" : "teal",
    });
  }
  if (d.status === "paid") {
    const last = docPayments[docPayments.length - 1];
    if (last) trail.push({ id: "paid", at: last.at, title: "Paid in full", tone: "ok" });
  }
  trail.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return {
    id: d.id as string,
    businessId,
    businessName: (business.data?.name as string | undefined) ?? "",
    branding: {
      tradingName: (branding.data?.trading_name as string | null) ?? null,
      addressLine: (branding.data?.address_line as string | null) ?? null,
      phone: (branding.data?.phone as string | null) ?? null,
      footerNote: (branding.data?.footer_note as string | null) ?? null,
    },
    type: d.type as string,
    status: d.status as string,
    number: (d.number as string | null) ?? null,
    currency: (d.currency_code as string) ?? "GHS",
    subtotal: Number(d.subtotal ?? d.total ?? 0),
    taxTotal: Number(d.tax_total ?? 0),
    total: Number(d.total ?? 0),
    lines,
    createdAt: d.created_at as string,
    issuedAt: (d.issued_at as string | null) ?? null,
    dueDate: (d.due_date as string | null) ?? null,
    validUntil: (d.valid_until as string | null) ?? null,
    sourceType: (d.source_entity_type as string | null) ?? null,
    sourceId: (d.source_entity_id as string | null) ?? null,
    party: supplier
      ? { kind: "supplier", name: supplier.name, phone: supplier.phone_e164, email: null, customerId: null }
      : {
          kind: "customer",
          name: customer?.display_name ?? null,
          phone: customer?.phone_e164 ?? null,
          email: customer?.email ?? null,
          customerId: (d.customer_id as string | null) ?? null,
        },
    amounts: {
      paid: Number(am?.paid ?? 0),
      credited: Number(am?.credited ?? 0),
      outstanding: Number(am?.outstanding ?? 0),
    },
    payments: docPayments,
    related,
    reminders: reminderRows,
    views,
    trail,
    paidInvoice,
  };
}
