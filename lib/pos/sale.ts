// Building a till sale, with nothing else attached.
//
// One function turns a basket and a payment into the three things a sale
// is on a till: the record kept on the device, the entry the outbox sends,
// and the receipt that is printed. It touches no storage and no screen, so
// both till layouts share it and it can be checked on its own.

import { newClientRef, receiptNumber } from "@/lib/ids";
import type { LocalItem, LocalSale, OutboxItem } from "@/lib/pos/db";
import type { DeviceContext } from "@/lib/pos/registration";
import type { ReceiptDoc } from "@/lib/pos/receipt";

export interface CartLine {
  item: LocalItem;
  quantity: number;
}

export interface CashPayment {
  method: "cash";
  tendered: number;
}

export type TillPayment = CashPayment;

export interface BuiltSale {
  sale: LocalSale;
  outboxItem: OutboxItem;
  doc: ReceiptDoc;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, l) => sum + l.item.price * l.quantity, 0);
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
  /** The device's next receipt sequence number. */
  seq: number;
  now: Date;
  device?: DeviceContext;
  shiftClientRef?: string;
  cashier?: { membershipId: string; displayName: string };
}): BuiltSale {
  const { cart, payment, seq, now, device, shiftClientRef, cashier } = input;
  const total = cartTotal(cart);
  const clientRef = newClientRef("sale");
  const receiptNo = receiptNumber(tillPrefix(device), now, seq);
  const businessDate = now.toISOString().slice(0, 10);

  const sale: LocalSale = {
    clientRef,
    receiptNumber: receiptNo,
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
    payments: [{ seq: "0", method: "cash", amount: total, tendered: payment.tendered }],
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
      subtotal: total,
      total,
      currencyCode: "GHS",
      receiptNumber: receiptNo,
      occurredAt: sale.occurredAt,
      businessDate,
      // The server maps this to the real shift once the shift itself has
      // synced; the outbox drains in creation order so it always has.
      shiftClientRef,
      cashierMembershipId: cashier?.membershipId,
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
    businessName: device?.label ?? "Ascend POS",
    receiptNumber: receiptNo,
    issuedAt: now,
    cashierName: cashier?.displayName,
    lines: cart.map((l) => ({
      name: l.item.name,
      quantity: l.quantity,
      unitPrice: l.item.price,
      amount: cents(l.item.price * l.quantity),
    })),
    subtotal: total,
    total,
    paymentMethod: "Cash",
    tendered: payment.tendered,
    change: cents(payment.tendered - total),
  };

  return { sale, outboxItem, doc };
}
