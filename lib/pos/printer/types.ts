// The contract every printer backend implements.
//
// Backends differ enormously — a Sunmi handheld exposes a Java AIDL
// service, a Bluetooth roll takes raw ESC/POS over a socket, and a phone
// with no printer falls back to the browser. The till should not know
// which of those it is talking to.

import type { ReceiptDoc } from "../receipt";

export type PrinterKind = "sunmi" | "pax" | "bluetooth" | "web" | "none";

export interface PrintResult {
  ok: boolean;
  /** Written for the cashier, in brand voice, never a driver error. */
  message?: string;
}

export interface PrinterAdapter {
  kind: PrinterKind;
  /** Shown when a merchant asks what this till prints with. */
  label: string;
  /** Paper width in millimetres, where the concept applies. */
  paperWidthMm?: 58 | 80;
  isAvailable(): Promise<boolean>;
  print(doc: ReceiptDoc): Promise<PrintResult>;
  /** Opens a connected cash drawer, where one exists. */
  openDrawer?(): Promise<void>;
}

// A till with no printer must still finish a sale. Printing is how a
// receipt reaches paper, never a condition of taking money.
export const NO_PRINTER: PrinterAdapter = {
  kind: "none",
  label: "No printer on this till",
  async isAvailable() {
    return true;
  },
  async print() {
    return {
      ok: false,
      message: "This till has no printer. Send the receipt on WhatsApp instead.",
    };
  },
};
