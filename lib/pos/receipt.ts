// A receipt as a document, not a string.
//
// The same sale has to reach a 58mm thermal roll on a Sunmi handheld, an
// 80mm roll on a counter printer, and a phone screen for a merchant with
// no printer at all. Building one structured document and letting each
// backend render it keeps those from drifting apart, which is how a
// receipt ends up correct on paper and wrong on screen.

import { formatGHS } from "@/lib/money";

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ReceiptDoc {
  businessName: string;
  locationName?: string;
  receiptNumber: string;
  issuedAt: Date;
  cashierName?: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paymentMethod: string;
  tendered?: number;
  change?: number;
  customerName?: string;
  footerNote?: string;
  /** Set when this receipt reverses an earlier sale (POS-017). */
  reversalOf?: string;
}

// Thermal printers speak a single-byte codepage. The cedi sign lives at
// U+20B5, which is in none of them, so a naive build prints a stray glyph
// or nothing at all on every line of every receipt. Paper says GHS.
export function thermalAmount(value: number): string {
  return formatGHS(value).replace(/GH₵\s?/, "GHS ");
}

export function screenAmount(value: number): string {
  return formatGHS(value);
}

// Receipts are read on a counter, not filed: date first, then time, no
// timezone noise.
export function receiptTimestamp(when: Date): string {
  const date = when.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = when.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

// Quantity reads as a bare number when whole, so "2 x GHS 5.00" does not
// become "2.000 x".
export function quantityLabel(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, "");
}
