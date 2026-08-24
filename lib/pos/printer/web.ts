// The fallback every device has: render the receipt and hand it to the
// browser's own print path. On a phone that reaches a shared or wireless
// printer, or a PDF the merchant can send on WhatsApp. On a handheld it is
// what runs until the native bridge is in place.

import {
  quantityLabel,
  receiptTimestamp,
  screenAmount,
  type ReceiptDoc,
} from "../receipt";
import type { PrinterAdapter, PrintResult } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sized to a roll rather than a page, so a merchant printing to a real
// thermal printer through the OS gets the same shape as our own encoder.
export function receiptHtml(doc: ReceiptDoc, widthMm: 58 | 80 = 58): string {
  const row = (left: string, right: string, strong = false) =>
    `<div class="row${strong ? " strong" : ""}"><span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span></div>`;

  const lines = doc.lines
    .map(
      (item) =>
        `<div class="item"><div class="name">${escapeHtml(item.name)}</div>` +
        row(
          `${quantityLabel(item.quantity)} x ${screenAmount(item.unitPrice)}`,
          screenAmount(item.amount)
        ) +
        `</div>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(doc.receiptNumber)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: ${widthMm}mm; margin: 0; padding: 4mm 3mm;
    font-family: "IBM Plex Mono", ui-monospace, "Courier New", monospace;
    font-size: ${widthMm === 58 ? 10 : 11}px; line-height: 1.45; color: #000;
  }
  .center { text-align: center; }
  .shop { font-size: ${widthMm === 58 ? 13 : 15}px; font-weight: 700; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { white-space: nowrap; }
  .strong { font-weight: 700; font-size: ${widthMm === 58 ? 12 : 14}px; }
  .item { margin-bottom: 3px; }
  .name { word-break: break-word; }
  .refund { font-weight: 700; letter-spacing: 2px; }
  .foot { margin-top: 8px; font-size: 9px; }
</style></head><body>
  <div class="center shop">${escapeHtml(doc.businessName)}</div>
  ${doc.locationName ? `<div class="center">${escapeHtml(doc.locationName)}</div>` : ""}
  ${doc.reversalOf ? `<div class="center refund">REFUND</div><div class="center">Reverses ${escapeHtml(doc.reversalOf)}</div>` : ""}
  <div class="rule"></div>
  ${row("Receipt", doc.receiptNumber)}
  <div>${escapeHtml(receiptTimestamp(doc.issuedAt))}</div>
  ${doc.cashierName ? row("Served by", doc.cashierName) : ""}
  ${doc.customerName ? row("Customer", doc.customerName) : ""}
  <div class="rule"></div>
  ${lines}
  <div class="rule"></div>
  ${row("Subtotal", screenAmount(doc.subtotal))}
  ${doc.discount ? row("Discount", "-" + screenAmount(doc.discount)) : ""}
  ${doc.tax ? row("Tax", screenAmount(doc.tax)) : ""}
  ${row("TOTAL", screenAmount(doc.total), true)}
  <div class="rule"></div>
  ${row("Paid by", doc.paymentMethod)}
  ${doc.tendered !== undefined ? row("Cash given", screenAmount(doc.tendered)) : ""}
  ${doc.change !== undefined ? row("Change", screenAmount(doc.change)) : ""}
  <div class="center foot">${escapeHtml(doc.footerNote ?? "Thank you. Come again.")}<br>Powered by AscendSME</div>
</body></html>`;
}

export const webPrinter: PrinterAdapter = {
  kind: "web",
  label: "Print through this device",
  paperWidthMm: 58,

  async isAvailable() {
    return typeof window !== "undefined" && typeof window.print === "function";
  },

  async print(doc: ReceiptDoc): Promise<PrintResult> {
    try {
      // A hidden iframe rather than a popup: a till in standalone mode has
      // no window chrome, and blocked popups would silently eat receipts.
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(frame);

      const view = frame.contentWindow;
      const docRef = frame.contentDocument;
      if (!view || !docRef) {
        frame.remove();
        return { ok: false, message: "This device would not open the receipt." };
      }

      docRef.open();
      docRef.write(receiptHtml(doc, this.paperWidthMm ?? 58));
      docRef.close();

      await new Promise((resolve) => setTimeout(resolve, 120));
      view.focus();
      view.print();

      // Leave the frame long enough for the print dialog to read it.
      setTimeout(() => frame.remove(), 60_000);
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: "The receipt did not reach the printer. Try again, or send it on WhatsApp.",
      };
    }
  },
};
