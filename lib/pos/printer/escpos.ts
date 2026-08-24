// ESC/POS encoding for thermal rolls.
//
// Deliberately pure: it takes a receipt and returns bytes, with no device
// in the middle. That means the layout can be proven correct on a desk,
// and only the transport needs a printer to test.

import {
  quantityLabel,
  receiptTimestamp,
  thermalAmount,
  type ReceiptDoc,
} from "../receipt";

// Columns at Font A. 58mm rolls are what most Ghanaian handhelds carry;
// 80mm turns up on counter printers.
export const COLUMNS: Record<58 | 80, number> = { 58: 32, 80: 48 };

const ESC = 0x1b;
const GS = 0x1d;

class Buf {
  private parts: number[] = [];

  raw(...bytes: number[]) {
    this.parts.push(...bytes);
    return this;
  }

  text(value: string) {
    for (const byte of encodeCp437(value)) this.parts.push(byte);
    return this;
  }

  line(value = "") {
    return this.text(value).raw(0x0a);
  }

  init() {
    return this.raw(ESC, 0x40);
  }

  align(mode: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, mode === "left" ? 0 : mode === "center" ? 1 : 2);
  }

  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  // n is width and height each 0-7, packed into one byte.
  size(width: number, height: number) {
    return this.raw(GS, 0x21, ((width & 7) << 4) | (height & 7));
  }

  feed(lines: number) {
    return this.raw(ESC, 0x64, lines);
  }

  cut() {
    // Feed before cutting or the blade takes the last line with it.
    return this.raw(GS, 0x56, 0x42, 0x03);
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

// Thermal printers speak a single byte codepage, so anything outside it is
// transliterated rather than sent and rendered as noise.
const TRANSLITERATE: Record<string, string> = {
  "₵": "GHS", // cedi sign
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "×": "x",
};

export function toPrintableAscii(value: string): string {
  let out = "";
  for (const char of value) {
    if (TRANSLITERATE[char] !== undefined) {
      out += TRANSLITERATE[char];
    } else if (char.charCodeAt(0) < 128) {
      out += char;
    } else {
      // Strip accents where we can, drop what we cannot represent.
      const stripped = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += stripped.charCodeAt(0) < 128 ? stripped : "";
    }
  }
  return out;
}

function encodeCp437(value: string): number[] {
  return Array.from(toPrintableAscii(value)).map((c) => c.charCodeAt(0) & 0xff);
}

/** Left text and right text on one row, padded to the roll width. */
export function twoColumn(left: string, right: string, width: number): string {
  const l = toPrintableAscii(left);
  const r = toPrintableAscii(right);
  const gap = width - l.length - r.length;
  if (gap >= 1) return l + " ".repeat(gap) + r;
  // Right side is the number and must never be truncated, so the label gives way.
  const room = Math.max(0, width - r.length - 1);
  return l.slice(0, room) + " " + r;
}

export function wrap(value: string, width: number): string[] {
  const words = toPrintableAscii(value).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    if (row === "") {
      row = word.slice(0, width);
      // A single word longer than the roll still has to land somewhere.
      let rest = word.slice(width);
      while (rest.length > 0) {
        rows.push(row);
        row = rest.slice(0, width);
        rest = rest.slice(width);
      }
    } else if (row.length + 1 + word.length <= width) {
      row += " " + word;
    } else {
      rows.push(row);
      row = word.slice(0, width);
    }
  }
  if (row) rows.push(row);
  return rows;
}

export function encodeReceipt(doc: ReceiptDoc, paperWidthMm: 58 | 80 = 58): Uint8Array {
  const width = COLUMNS[paperWidthMm];
  const rule = "-".repeat(width);
  const b = new Buf();

  b.init().align("center");

  b.size(1, 1).bold(true).line(doc.businessName).bold(false).size(0, 0);
  if (doc.locationName) b.line(doc.locationName);
  b.line();

  if (doc.reversalOf) {
    // A reversal must be unmistakable in a shoebox of receipts.
    b.bold(true).line("REFUND").bold(false);
    b.line("Reverses " + doc.reversalOf);
    b.line();
  }

  b.align("left");
  b.line(twoColumn("Receipt", doc.receiptNumber, width));
  b.line(receiptTimestamp(doc.issuedAt));
  if (doc.cashierName) b.line(twoColumn("Served by", doc.cashierName, width));
  if (doc.customerName) b.line(twoColumn("Customer", doc.customerName, width));
  b.line(rule);

  for (const item of doc.lines) {
    for (const row of wrap(item.name, width)) b.line(row);
    const qty = `${quantityLabel(item.quantity)} x ${thermalAmount(item.unitPrice)}`;
    b.line(twoColumn(qty, thermalAmount(item.amount), width));
  }

  b.line(rule);
  b.line(twoColumn("Subtotal", thermalAmount(doc.subtotal), width));
  if (doc.discount) {
    b.line(twoColumn("Discount", "-" + thermalAmount(doc.discount), width));
  }
  if (doc.tax) b.line(twoColumn("Tax", thermalAmount(doc.tax), width));

  b.bold(true).size(0, 1);
  b.line(twoColumn("TOTAL", thermalAmount(doc.total), width));
  b.size(0, 0).bold(false);

  b.line(rule);
  b.line(twoColumn("Paid by", doc.paymentMethod, width));
  if (doc.tendered !== undefined) {
    b.line(twoColumn("Cash given", thermalAmount(doc.tendered), width));
  }
  if (doc.change !== undefined) {
    b.line(twoColumn("Change", thermalAmount(doc.change), width));
  }

  b.line();
  b.align("center");
  for (const row of wrap(doc.footerNote ?? "Thank you. Come again.", width)) {
    b.line(row);
  }
  b.line("Powered by AscendSME");

  b.feed(3).cut();
  return b.bytes();
}

/** Drawer kick on pin 2, the common wiring. */
export function drawerKickBytes(): Uint8Array {
  return new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xfa]);
}
