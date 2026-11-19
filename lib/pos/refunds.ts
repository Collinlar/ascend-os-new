// Asking for a refund from the till, and the till's own record of its sales.
//
// A cashier never hands money back on their own say (POS-009, POS-017). The
// till asks; the request waits in Work until the owner or a manager decides,
// and the reversal happens there. The request is queued like a sale, so it
// can be asked with no network, and it names the sale by the till's own
// reference, which the server turns into the sale (app/api/pos/sync).

import { newClientRef } from "@/lib/ids";
import { get, getAll, getMeta, put, setMeta, STORE, type LocalSale, type OutboxItem } from "@/lib/pos/db";
import { getDeviceToken } from "@/lib/pos/registration";
import { addRefundPaid, getActiveShift } from "@/lib/pos/shift";
import type { ReceiptDoc } from "@/lib/pos/receipt";
import { MOMO_NETWORKS } from "@/lib/pos/sale";

/** This till's sales from today and yesterday, newest first. */
export async function recentSales(limit = 80): Promise<LocalSale[]> {
  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const all = await getAll<LocalSale>(STORE.sales);
  return all
    .filter((s) => s.occurredAt >= since)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}

/** Whether a sale has reached the office yet. */
export async function sentToOffice(sale: LocalSale): Promise<boolean> {
  if (sale.synced) return true;
  return !(await get<OutboxItem>(STORE.outbox, sale.clientRef));
}

export function paidBy(sale: LocalSale): string {
  const p = sale.payments[0];
  if (!p) return "";
  switch (p.method) {
    case "cash":
      return "Cash";
    case "mobile_money":
      return MOMO_NETWORKS.find((n) => n.key === p.provider)?.label ?? "Mobile money";
    case "card":
      return "Card";
    case "credit":
      return "On credit";
    default:
      return p.method;
  }
}

/** The receipt again, from what the till kept. */
export function receiptFor(sale: LocalSale, businessName: string, cashierName?: string): ReceiptDoc {
  const p = sale.payments[0];
  const subtotal = sale.subtotal ?? sale.total;
  return {
    businessName,
    receiptNumber: sale.receiptNumber,
    issuedAt: new Date(sale.occurredAt),
    cashierName,
    customerName: sale.customerName,
    lines: sale.lines.map((l) => ({ name: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.lineTotal })),
    subtotal,
    discount: sale.discountTotal ? sale.discountTotal : undefined,
    total: sale.total,
    paymentMethod: p?.providerReference ? `${paidBy(sale)} ${p.providerReference}` : paidBy(sale),
    tendered: p?.method === "cash" ? p.tendered : undefined,
    change: p?.method === "cash" && p.tendered !== undefined ? Math.round((p.tendered - sale.total) * 100) / 100 : undefined,
    footerNote: "Copy",
  };
}

export type RefundAsk = { ok: true; sale: LocalSale } | { ok: false; error: string };

export async function askForRefund(sale: LocalSale, reason: string, cashierMembershipId?: string): Promise<RefundAsk> {
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Say why. The owner reads this when they decide." };
  if (sale.refund) return { ok: false, error: "A refund is already asked for on this sale." };
  const now = new Date().toISOString();
  const clientRef = newClientRef("refund");
  const item: OutboxItem = {
    clientRef,
    kind: "refund.requested",
    payload: { clientRef, saleClientRef: sale.clientRef, reason: why, cashierMembershipId },
    state: "pending",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    lastError: null,
  };
  const updated: LocalSale = { ...sale, refund: { clientRef, reason: why, askedAt: now, askedBy: cashierMembershipId } };
  // The request first: if the app dies between the two, the owner still
  // hears about it, and the till only forgets that it asked.
  await put(STORE.outbox, item);
  await put(STORE.sales, updated);
  return { ok: true, sale: updated };
}

// ----- Decisions, and handing the money back (0123) -----------------------
//
// Refunds come from the drawer (Collins, 19 November 2026). Once a refund is
// decided in Work the till hears about it here: an approved refund on a cash
// sale is handed back across this counter and recorded against the shift it
// came out of; one on a MoMo or card sale is the owner's to return, and the
// till only says so; a refund turned down is said too.

export interface RefundDecision {
  approvalId: string;
  status: "approved" | "rejected";
  decidedAt: string;
  receipt: string;
  total: number;
  /** What the sale took in cash, and so what comes out of the drawer. */
  cash: number;
  method: string | null;
  customerName: string | null;
  /** Handed back already, on the server's record or this till's. */
  paid: boolean;
}

const DECISIONS_KEY = "refundDecisions";
const SEEN_KEY = "refundDecisionsSeen";

export async function getDecisions(): Promise<RefundDecision[]> {
  return (await getMeta<RefundDecision[]>(DECISIONS_KEY)) ?? [];
}

/** Decisions the cashier still has to act on or acknowledge. */
export async function openDecisions(): Promise<RefundDecision[]> {
  const seen = new Set((await getMeta<string[]>(SEEN_KEY)) ?? []);
  return (await getDecisions()).filter((d) => {
    if (d.status === "approved" && d.cash > 0) return !d.paid;
    return !seen.has(d.approvalId);
  });
}

export async function pullDecisions(): Promise<boolean> {
  const token = await getDeviceToken();
  if (!token) return false;
  try {
    const response = await fetch("/api/pos/refunds", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return false;
    const data = (await response.json()) as { refunds: RefundDecision[] };
    // A payout this till has queued but not yet sent still counts as paid.
    const paidHere = new Set((await getDecisions()).filter((d) => d.paid).map((d) => d.approvalId));
    await setMeta(
      DECISIONS_KEY,
      (data.refunds ?? []).map((d) => ({ ...d, paid: d.paid || paidHere.has(d.approvalId) }))
    );
    return true;
  } catch {
    return false;
  }
}

export async function acknowledge(approvalId: string): Promise<void> {
  const seen = (await getMeta<string[]>(SEEN_KEY)) ?? [];
  if (!seen.includes(approvalId)) await setMeta(SEEN_KEY, [...seen, approvalId].slice(-200));
}

/** The cashier has handed an approved refund back from the drawer. */
export async function handedBack(d: RefundDecision, cashierMembershipId?: string): Promise<boolean> {
  const shift = await getActiveShift();
  if (!shift || d.status !== "approved" || d.cash <= 0 || d.paid) return false;
  const now = new Date().toISOString();
  const clientRef = newClientRef("payout");
  const item: OutboxItem = {
    clientRef,
    kind: "refund.paid",
    payload: { clientRef, approvalId: d.approvalId, shiftClientRef: shift.clientRef, paidAt: now, cashierMembershipId },
    state: "pending",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    lastError: null,
  };
  // The record for the office first, then the drawer's own count, then the
  // note that it is done, so a crash part way never pays out twice.
  await put(STORE.outbox, item);
  await addRefundPaid({ approvalId: d.approvalId, receipt: d.receipt, amount: d.cash, paidAt: now });
  await setMeta(
    DECISIONS_KEY,
    (await getDecisions()).map((x) => (x.approvalId === d.approvalId ? { ...x, paid: true } : x))
  );
  return true;
}
