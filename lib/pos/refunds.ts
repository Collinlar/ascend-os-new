// Asking for a refund from the till, and the till's own record of its sales.
//
// A cashier never hands money back on their own say (POS-009, POS-017). The
// till asks; the request waits in Work until the owner or a manager decides,
// and the reversal happens there. The request is queued like a sale, so it
// can be asked with no network, and it names the sale by the till's own
// reference, which the server turns into the sale (app/api/pos/sync).

import { newClientRef } from "@/lib/ids";
import { get, getAll, put, STORE, type LocalSale, type OutboxItem } from "@/lib/pos/db";
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
