// Building a till sale, with nothing else attached.
//
// One function turns a basket, a payment, and optionally a customer and a
// discount into the three things a sale is on a till: the record kept on
// the device, the entry the outbox sends, and the receipt that is printed.
// It touches no storage and no screen, so both till layouts share it and it
// can be checked on its own.

import { newClientRef, receiptNumber } from "@/lib/ids";
import type { LocalItem, LocalSale, OutboxItem } from "@/lib/pos/db";
import type { DeviceContext } from "@/lib/pos/registration";
import type { ReceiptDoc } from "@/lib/pos/receipt";
import type { SaleCustomer } from "@/lib/pos/customers";

export interface CartLine {
  item: LocalItem;
  quantity: number;
}

export type MomoNetwork = "mtn_momo" | "telecel_cash" | "at_money";

export const MOMO_NETWORKS: { key: MomoNetwork; label: string }[] = [
  { key: "mtn_momo", label: "MTN MoMo" },
  { key: "telecel_cash", label: "Telecel Cash" },
  { key: "at_money", label: "AT Money" },
];

// Every way a till takes payment today. MoMo and card are recorded by the
// cashier with the reference the customer's phone or the bank's machine
// shows; nothing here pretends a provider confirmed them, and the sale says
// "recorded by you" until one does. QR and a MoMo prompt wait for Paystack.
export type TillPayment =
  | { method: "cash"; tendered: number }
  | { method: "momo"; network: MomoNetwork; reference: string }
  | { method: "card"; reference: string }
  | { method: "credit" };

export interface TillDiscount {
  /** Set for "10% off": the amount follows the basket as it changes. */
  percent?: number;
  amount: number;
  /** Shown on the sale and the receipt: "10%" or "GH₵5.00". */
  label: string;
  /** The owner or manager who allowed it (0122). */
  approvedBy: string;
  approvedByName: string;
}

export interface BuiltSale {
  sale: LocalSale;
  outboxItem: OutboxItem;
  doc: ReceiptDoc;
}

export const cents = (n: number) => Math.round(n * 100) / 100;

export function cartTotal(cart: CartLine[]): number {
  return cents(cart.reduce((sum, l) => sum + l.item.price * l.quantity, 0));
}

/** What the customer pays: the basket less any discount, never below nothing. */
export function amountDue(cart: CartLine[], discount?: TillDiscount | null): number {
  return cents(Math.max(0, cartTotal(cart) - (discount?.amount ?? 0)));
}

export function paymentLabel(p: TillPayment): string {
  switch (p.method) {
    case "cash":
      return "Cash";
    case "momo":
      return MOMO_NETWORKS.find((n) => n.key === p.network)?.label ?? "Mobile money";
    case "card":
      return "Card";
    case "credit":
      return "On credit";
  }
}

// Which till this is, for the receipt prefix. It used to be a constant, so
// every till in every shop stamped T01 and every till counted from one.
// sale carries unique (business_id, receipt_number), so a second counter's
// first sale of the day collided with the first counter's and was rejected
// for good, after the money had been taken and the receipt printed.
//
// The number comes from the server, which is the only party that knows what
// a business has already handed out. A till that somehow has none falls back
// to its device id, which is ugly on paper but unique, and a strange receipt
// number is far better than a lost sale.
export function tillPrefix(device: DeviceContext | undefined): string {
  if (device?.deviceNumber) return `T${String(device.deviceNumber).padStart(2, "0")}`;
  if (device?.deviceId) return `T${device.deviceId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  return "T01";
}

export function buildSale(input: {
  cart: CartLine[];
  payment: TillPayment;
  customer?: SaleCustomer | null;
  discount?: TillDiscount | null;
  /** The device's next receipt sequence number. */
  seq: number;
  now: Date;
  device?: DeviceContext;
  shiftClientRef?: string;
  cashier?: { membershipId: string; displayName: string };
}): BuiltSale {
  const { cart, payment, customer, discount, seq, now, device, shiftClientRef, cashier } = input;
  if (payment.method === "credit" && !customer) throw new Error("credit_needs_customer");
  const subtotal = cartTotal(cart);
  const discountTotal = cents(Math.min(discount?.amount ?? 0, subtotal));
  const total = cents(subtotal - discountTotal);
  const clientRef = newClientRef("sale");
  const receiptNo = receiptNumber(tillPrefix(device), now, seq);
  const businessDate = now.toISOString().slice(0, 10);

  const pay: LocalSale["payments"][number] =
    payment.method === "cash"
      ? { seq: "0", method: "cash", amount: total, tendered: payment.tendered }
      : payment.method === "momo"
        ? { seq: "0", method: "mobile_money", amount: total, provider: payment.network, providerReference: payment.reference.trim() }
        : payment.method === "card"
          ? { seq: "0", method: "card", amount: total, providerReference: payment.reference.trim() }
          : { seq: "0", method: "credit", amount: total };

  const sale: LocalSale = {
    clientRef,
    receiptNumber: receiptNo,
    subtotal,
    discountTotal,
    total,
    currencyCode: "GHS",
    lines: cart.map((l) => ({
      itemId: l.item.id,
      description: l.item.name,
      quantity: l.quantity,
      unitPrice: l.item.price,
      lineTotal: cents(l.item.price * l.quantity),
      trackStock: l.item.trackStock,
    })),
    payments: [pay],
    customerName: customer?.name,
    occurredAt: now.toISOString(),
    businessDate,
    shiftId: shiftClientRef,
    synced: false,
  };

  const outboxItem: OutboxItem = {
    clientRef,
    kind: "sale.completed",
    // Business, location and device are injected server-side from the
    // authenticated device token, so a till can only write to the
    // business it was paired with.
    payload: {
      clientRef,
      subtotal,
      discountTotal,
      total,
      currencyCode: "GHS",
      receiptNumber: receiptNo,
      occurredAt: sale.occurredAt,
      businessDate,
      // The server maps this to the real shift once the shift itself has
      // synced; the outbox drains in creation order so it always has.
      shiftClientRef,
      cashierMembershipId: cashier?.membershipId,
      customerId: customer && "id" in customer ? customer.id : undefined,
      newCustomer: customer && "isNew" in customer ? { name: customer.name, phone: customer.phone } : undefined,
      discountApprovedBy: discountTotal > 0 ? discount?.approvedBy : undefined,
      lines: sale.lines,
      payments: sale.payments,
    },
    state: "pending",
    retryCount: 0,
    createdAt: now.toISOString(),
    lastAttemptAt: null,
    nextAttemptAt: now.toISOString(),
    lastError: null,
  };

  // The receipt document, built once and kept so a reprint never
  // re-derives it from state the till has already moved on from.
  const doc: ReceiptDoc = {
    businessName: device?.businessName ?? device?.label ?? "Ascend POS",
    locationName: device?.locationName ?? undefined,
    receiptNumber: receiptNo,
    issuedAt: now,
    cashierName: cashier?.displayName,
    customerName: customer?.name,
    lines: cart.map((l) => ({
      name: l.item.name,
      quantity: l.quantity,
      unitPrice: l.item.price,
      amount: cents(l.item.price * l.quantity),
    })),
    subtotal,
    discount: discountTotal > 0 ? discountTotal : undefined,
    total,
    paymentMethod:
      payment.method === "momo" || payment.method === "card"
        ? `${paymentLabel(payment)} ${payment.reference.trim()}`
        : paymentLabel(payment),
    tendered: payment.method === "cash" ? payment.tendered : undefined,
    change: payment.method === "cash" ? cents(payment.tendered - total) : undefined,
  };

  return { sale, outboxItem, doc };
}
