import "server-only";

import { supabaseServer } from "@/lib/supabase";

// The Documents list (Modules M3): every document with where it came from and
// what is left on it, the four figures, and what needs the owner today.
// Balances come from the Financial Foundation (receivables_aging, 0102), so
// "owed" here is the same number Money and Home show.

export interface ListDoc {
  id: string;
  type: string;
  status: string;
  number: string | null;
  total: number | null;
  dueDate: string | null;
  createdAt: string;
  issuedAt: string | null;
  /** Still owed after payments and credits; null when nothing is. */
  outstanding: number | null;
  customerName: string | null;
  /** Where it came from: "Booking", "Shop order", "From QUO-0012". */
  cameFrom: string;
}

export interface DocFigures {
  outstanding: number;
  openCount: number;
  overdue: number;
  overdueCount: number;
  oldestOverdueDays: number | null;
  collectedThisMonth: number;
  paymentsThisMonth: number;
  /** Share of this month's money that came through pay links, 0 to 100. */
  viaPayLinks: number;
  /** Days from issue to the last payment, invoices paid in the last 90 days. */
  avgDaysToPay: number | null;
  paidInvoices90: number;
  drafts: number;
}

export interface NeedsYou {
  overdue: Array<{ id: string; number: string | null; customer: string | null; outstanding: number; daysOverdue: number; reachable: boolean }>;
  /** Quotations the customer accepted that have no invoice yet. */
  accepted: Array<{ id: string; number: string | null; customer: string | null; total: number | null }>;
  drafts: Array<{ id: string; type: string; customer: string | null; total: number | null }>;
}

const SOURCE: Record<string, string> = {
  sale: "Till sale",
  shop_order: "Shop order",
  service_booking: "Booking",
  project: "Job",
};

const ACCRA = "Africa/Accra";
const accraDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ACCRA });

export async function loadDocumentsWorkspace(businessId: string): Promise<{ docs: ListDoc[]; figures: DocFigures; needs: NeedsYou }> {
  const db = supabaseServer();
  const today = accraDay(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString();

  const [docsRes, aging, monthPay, recentPay] = await Promise.all([
    db
      .from("document")
      .select(
        "id, type, status, number, total, due_date, created_at, issued_at, source_entity_type, converted_from, payment_id, customer:customer_id(display_name, phone_e164, email), supplier:supplier_id(name)"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(200),
    db.rpc("receivables_aging", { p_business: businessId }),
    db
      .from("payment")
      .select("amount, status, reversal_of, verification")
      .eq("business_id", businessId)
      .eq("source_entity_type", "document")
      .in("status", ["confirmed", "refunded"])
      .gte("occurred_at", new Date(`${monthStart}T00:00:00Z`).toISOString()),
    db
      .from("payment")
      .select("source_entity_id, occurred_at")
      .eq("business_id", businessId)
      .eq("source_entity_type", "document")
      .eq("status", "confirmed")
      .is("reversal_of", null)
      .gte("occurred_at", ninetyAgo)
      .limit(1000),
  ]);
  const rows = docsRes.data ?? [];

  // What each invoice still owes, by its number.
  const owedBy = new Map<string, number>();
  const fig = {
    outstanding: 0,
    openCount: 0,
    overdue: 0,
    overdueCount: 0,
    oldestOverdueDays: null as number | null,
  };
  for (const r of (aging.data ?? []) as Array<{ document_number: string | null; origin_type: string; outstanding: number | string; days_overdue: number | null }>) {
    if (r.document_number) owedBy.set(r.document_number, (owedBy.get(r.document_number) ?? 0) + Number(r.outstanding));
    if (r.origin_type !== "document") continue;
    fig.outstanding += Number(r.outstanding);
    fig.openCount += 1;
    if ((r.days_overdue ?? 0) > 0) {
      fig.overdue += Number(r.outstanding);
      fig.overdueCount += 1;
      fig.oldestOverdueDays = Math.max(fig.oldestOverdueDays ?? 0, r.days_overdue ?? 0);
    }
  }

  // Money in this month on documents, less refunds.
  let collected = 0;
  let viaLinks = 0;
  let paymentsThisMonth = 0;
  for (const p of monthPay.data ?? []) {
    const n = Number(p.amount);
    if (p.status === "confirmed" && !p.reversal_of) {
      collected += n;
      paymentsThisMonth += 1;
      if (p.verification === "provider_confirmed") viaLinks += n;
    } else if (p.status === "refunded" && p.reversal_of) {
      collected -= n;
    }
  }

  // Days to payment: issue to the last payment, for invoices now paid.
  const lastPaid = new Map<string, string>();
  for (const p of recentPay.data ?? []) {
    const id = p.source_entity_id as string;
    if (!lastPaid.has(id) || (p.occurred_at as string) > lastPaid.get(id)!) lastPaid.set(id, p.occurred_at as string);
  }
  const spans: number[] = [];
  for (const d of rows) {
    if (d.type !== "invoice" || d.status !== "paid" || !d.issued_at) continue;
    const paid = lastPaid.get(d.id as string);
    if (!paid) continue;
    spans.push(Math.max(0, (new Date(paid).getTime() - new Date(d.issued_at as string).getTime()) / 864e5));
  }

  // Where each came from. A converted document names its parent's number.
  const byId = new Map(rows.map((d) => [d.id as string, d]));
  const missingParents = rows.map((d) => d.converted_from as string | null).filter((x): x is string => !!x && !byId.has(x));
  const parents = new Map<string, string | null>();
  if (missingParents.length > 0) {
    const { data: ps } = await db.from("document").select("id, number").in("id", Array.from(new Set(missingParents)));
    for (const p of ps ?? []) parents.set(p.id as string, (p.number as string | null) ?? null);
  }
  const cameFrom = (d: (typeof rows)[number]): string => {
    if (d.converted_from) {
      const n = (byId.get(d.converted_from as string)?.number as string | null | undefined) ?? parents.get(d.converted_from as string) ?? null;
      return n ? `From ${n}` : "Made from another";
    }
    if (d.payment_id) return "A payment";
    if (d.source_entity_type && SOURCE[d.source_entity_type as string]) return SOURCE[d.source_entity_type as string];
    return "Made here";
  };

  const nameOf = (d: (typeof rows)[number]) =>
    (d.supplier as unknown as { name: string } | null)?.name ??
    (d.customer as unknown as { display_name: string } | null)?.display_name ??
    null;

  const docs: ListDoc[] = rows.map((d) => ({
    id: d.id as string,
    type: d.type as string,
    status: d.status as string,
    number: (d.number as string | null) ?? null,
    total: d.total === null ? null : Number(d.total),
    dueDate: (d.due_date as string | null) ?? null,
    createdAt: d.created_at as string,
    issuedAt: (d.issued_at as string | null) ?? null,
    outstanding: d.number ? owedBy.get(d.number as string) ?? null : null,
    customerName: nameOf(d),
    cameFrom: cameFrom(d),
  }));

  // ------------------------------------------------------ needs you today --
  const overdue = rows
    .filter((d) => d.type === "invoice" && d.number && (owedBy.get(d.number as string) ?? 0) > 0.005 && d.due_date && (d.due_date as string) < today)
    .map((d) => {
      const c = d.customer as unknown as { display_name: string | null; phone_e164: string | null; email: string | null } | null;
      return {
        id: d.id as string,
        number: d.number as string,
        customer: c?.display_name ?? null,
        outstanding: owedBy.get(d.number as string) ?? 0,
        daysOverdue: Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${d.due_date}T00:00:00Z`).getTime()) / 864e5),
        reachable: Boolean(c?.phone_e164 || c?.email),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  const invoicedFrom = new Set(rows.filter((d) => d.converted_from && (d.type === "invoice" || d.type === "proforma")).map((d) => d.converted_from as string));
  const accepted = rows
    .filter((d) => d.type === "quotation" && ["accepted", "approved"].includes(d.status as string) && !invoicedFrom.has(d.id as string))
    .map((d) => ({ id: d.id as string, number: (d.number as string | null) ?? null, customer: nameOf(d), total: d.total === null ? null : Number(d.total) }));
  const drafts = rows
    .filter((d) => !d.number && d.status === "draft")
    .map((d) => ({ id: d.id as string, type: d.type as string, customer: nameOf(d), total: d.total === null ? null : Number(d.total) }));

  return {
    docs,
    figures: {
      ...fig,
      collectedThisMonth: Math.max(0, collected),
      paymentsThisMonth,
      viaPayLinks: collected > 0 ? Math.round((viaLinks / collected) * 100) : 0,
      avgDaysToPay: spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null,
      paidInvoices90: spans.length,
      drafts: drafts.length,
    },
    needs: { overdue, accepted, drafts },
  };
}
