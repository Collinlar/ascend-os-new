// Picking a printer.
//
// The till asks for the best backend available and gets one, without
// knowing whether it is a Sunmi handheld, a Bluetooth roll or a browser.
// Selection is by capability, never by guessing from the user agent.

import type { ReceiptDoc } from "../receipt";
import { encodeReceipt, drawerKickBytes } from "./escpos";
import type { PrinterAdapter, PrinterKind, PrintResult } from "./types";
import { NO_PRINTER } from "./types";
import { webPrinter } from "./web";

export type { PrinterAdapter, PrinterKind, PrintResult } from "./types";
export { encodeReceipt, COLUMNS } from "./escpos";
export { receiptHtml } from "./web";

// The shape a native shell injects. Capacitor, or a plain Android
// JavascriptInterface, exposes this on the window; the vendor SDK
// differences (Sunmi AIDL, PAX NeptuneLite, Bluetooth SPP) live behind it
// on the Java side, because none of them are reachable from a WebView.
export interface NativePrinterBridge {
  kind: PrinterKind;
  label?: string;
  paperWidthMm?: 58 | 80;
  /** Base64 ESC/POS payload, since the bridge carries strings. */
  printBytes(base64: string): Promise<boolean> | boolean;
  openDrawer?(): Promise<void> | void;
  isReady?(): Promise<boolean> | boolean;
}

declare global {
  interface Window {
    AscendPrinter?: NativePrinterBridge;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function nativeAdapter(bridge: NativePrinterBridge): PrinterAdapter {
  const paper = bridge.paperWidthMm ?? 58;
  return {
    kind: bridge.kind,
    label: bridge.label ?? "Built in printer",
    paperWidthMm: paper,

    async isAvailable() {
      try {
        return bridge.isReady ? await bridge.isReady() : true;
      } catch {
        return false;
      }
    },

    async print(doc: ReceiptDoc): Promise<PrintResult> {
      try {
        const ok = await bridge.printBytes(toBase64(encodeReceipt(doc, paper)));
        return ok
          ? { ok: true }
          : {
              ok: false,
              // The most common cause by far, and the one a cashier can fix.
              message: "The printer did not respond. Check the paper and try again.",
            };
      } catch {
        return {
          ok: false,
          message: "The printer did not respond. Check the paper and try again.",
        };
      }
    },

    async openDrawer() {
      try {
        if (bridge.openDrawer) await bridge.openDrawer();
        else await bridge.printBytes(toBase64(drawerKickBytes()));
      } catch {
        // A drawer that will not open must not fail a completed sale.
      }
    },
  };
}

let cached: PrinterAdapter | undefined;

export async function getPrinter(force = false): Promise<PrinterAdapter> {
  if (cached && !force) return cached;

  // A native shell wins whenever it is present: it reaches the built in
  // roll, which is the reason a merchant bought the handheld.
  const bridge = typeof window !== "undefined" ? window.AscendPrinter : undefined;
  if (bridge) {
    const adapter = nativeAdapter(bridge);
    if (await adapter.isAvailable()) {
      cached = adapter;
      return adapter;
    }
  }

  // Note on Bluetooth: most low cost thermal printers speak Serial Port
  // Profile over Bluetooth Classic, which Web Bluetooth cannot reach at
  // all — it only speaks BLE. So there is no browser path to those, and
  // they are handled by the native bridge above rather than pretended at
  // here.

  if (await webPrinter.isAvailable()) {
    cached = webPrinter;
    return webPrinter;
  }

  cached = NO_PRINTER;
  return NO_PRINTER;
}

export function resetPrinterCache(): void {
  cached = undefined;
}
