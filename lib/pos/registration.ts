// Terminal-side registration state. The device token lives only on this
// device, in the local store, and is sent as a Bearer credential on sync
// and catalogue calls.

import {
  getAll,
  getMeta,
  replaceCatalogue,
  setMeta,
  STORE,
  type LocalItem,
  type OutboxItem,
} from "./db";
import { secureGet, secureRemove, secureSet } from "./durable";

const TOKEN_KEY = "deviceToken";
const DEVICE_KEY = "deviceContext";

export interface DeviceContext {
  deviceId: string;
  businessId: string;
  locationId: string;
  label: string | null;
  leaseExpiresAt: string;
  /** This till's number within the business. Receipt numbers are built
      from it, so two counters never issue the same one. */
  deviceNumber?: number | null;
}

// The token routes through durable storage: it is the one credential that,
// if lost, takes the till offline until an owner re-pairs it by hand.
export async function getDeviceToken(): Promise<string | undefined> {
  return secureGet<string>(TOKEN_KEY);
}

export async function getDeviceContext(): Promise<DeviceContext | undefined> {
  return getMeta<DeviceContext>(DEVICE_KEY);
}

export async function isRegistered(): Promise<boolean> {
  return Boolean(await getDeviceToken());
}

// A terminal whose lease has run out must reach the server before it can
// sell again (POS-OFF-006). This is what stops a lost till from operating
// indefinitely on its own.
export function leaseExpired(context: DeviceContext | undefined): boolean {
  if (!context) return false;
  return new Date(context.leaseExpiresAt).getTime() < Date.now();
}

export type PairResult =
  | { ok: true; context: DeviceContext }
  | { ok: false; error: string };

export async function pairTerminal(code: string): Promise<PairResult> {
  try {
    const response = await fetch("/api/pos/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        deviceFingerprint: await deviceFingerprint(),
        model: navigator.userAgent.slice(0, 120),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: data.error ?? "We could not set up this till. Try again." };
    }

    const context: DeviceContext = {
      deviceId: data.deviceId,
      businessId: data.businessId,
      locationId: data.locationId,
      label: data.label ?? null,
      leaseExpiresAt: data.leaseExpiresAt,
      deviceNumber: data.deviceNumber ?? null,
    };
    await secureSet(TOKEN_KEY, data.token);
    await setMeta(DEVICE_KEY, context);
    return { ok: true, context };
  } catch {
    return {
      ok: false,
      error: "We could not reach the network. This till needs network once to set up.",
    };
  }
}

// Pulls prices and stock for this till's business and location. Called
// after pairing and on each successful sync window (POS-SYN-007).
export async function pullCatalogue(): Promise<{ ok: boolean; count: number }> {
  const token = await getDeviceToken();
  if (!token) return { ok: false, count: 0 };

  try {
    const response = await fetch("/api/pos/catalogue", {
      headers: { Authorization: `Bearer ${token}` },
      // The till is asking precisely because it wants to know what changed.
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, count: 0 };

    const data = (await response.json()) as {
      items: LocalItem[];
      leaseExpiresAt: string;
      label: string | null;
      deviceNumber?: number | null;
      receiptSeqHigh?: number;
    };
    // Barcodes attached at the counter but not yet accepted by the server
    // are re-applied on top of what the server sent. Without this a refresh
    // silently undoes the cashier's work: they attach a code, the catalogue
    // pulls a few minutes later, and the till stops recognising the product
    // again until the queue happens to drain.
    await replaceCatalogue(applyPendingBarcodes(data.items, await pendingBarcodes()));

    // Never go backwards: a till mid-day knows better than the server, which
    // has only seen what reached it. Only a counter that fell behind is
    // caught up, which is exactly the cleared-storage case.
    if (typeof data.receiptSeqHigh === "number" && data.receiptSeqHigh > 0) {
      const localSeq = (await getMeta<number>("receiptSeq")) ?? 0;
      if (data.receiptSeqHigh > localSeq) {
        await setMeta("receiptSeq", data.receiptSeqHigh);
      }
    }

    const context = await getDeviceContext();
    if (context) {
      await setMeta(DEVICE_KEY, {
        ...context,
        leaseExpiresAt: data.leaseExpiresAt,
        label: data.label ?? context.label,
        // Tills paired before numbering existed pick theirs up here.
        deviceNumber: data.deviceNumber ?? context.deviceNumber ?? null,
      });
    }
    return { ok: true, count: data.items.length };
  } catch {
    return { ok: false, count: 0 };
  }
}

// Clears device credentials after revocation. Completed sales stay on the
// device as the merchant's record; only the ability to sync is removed.
export async function clearRegistration(): Promise<void> {
  await secureRemove(TOKEN_KEY);
  await setMeta(DEVICE_KEY, undefined);
}

async function deviceFingerprint(): Promise<string> {
  const existing = await getMeta<string>("deviceFingerprint");
  if (existing) return existing;
  const generated =
    globalThis.crypto?.randomUUID?.() ?? `fp-${Date.now()}-${Math.random()}`;
  await setMeta("deviceFingerprint", generated);
  return generated;
}

// Keeping the shelf current.
//
// The catalogue used to be pulled once, when the till booted, and never
// again. An owner adding a product or changing a price on their phone would
// watch the counter keep selling yesterday's list until somebody thought to
// reload the page, which is not a thing anyone in a shop thinks to do.
//
// Refreshes are driven by the moments that matter rather than by a fast
// timer: coming back online, and returning to the till, which is exactly
// when someone has just finished changing something elsewhere. The interval
// is deliberately slow, because a full catalogue pull costs the merchant
// data and most minutes of a shift change nothing.
const REFRESH_MS = 10 * 60 * 1000;

export function startCatalogueRefresh(
  onRefreshed: (count: number) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let running = false;
  const run = async () => {
    if (running || !navigator.onLine) return;
    running = true;
    try {
      const { ok, count } = await pullCatalogue();
      if (ok) onRefreshed(count);
    } catch {
      // The till keeps its last known catalogue, which is the whole point.
    } finally {
      running = false;
    }
  };

  window.addEventListener("online", run);
  window.addEventListener("focus", run);
  const timer = window.setInterval(run, REFRESH_MS);

  return () => {
    window.removeEventListener("online", run);
    window.removeEventListener("focus", run);
    window.clearInterval(timer);
  };
}

interface PendingBarcode {
  itemId: string;
  barcode: string;
}

async function pendingBarcodes(): Promise<PendingBarcode[]> {
  try {
    const rows = await getAll<OutboxItem>(STORE.outbox);
    return rows
      .filter((r) => r.kind === "catalogue.barcode.attached" && r.state !== "synced")
      .map((r) => r.payload as PendingBarcode)
      .filter((p) => p && p.itemId && p.barcode);
  } catch {
    return [];
  }
}

function applyPendingBarcodes(
  items: LocalItem[],
  pending: PendingBarcode[]
): LocalItem[] {
  if (pending.length === 0) return items;
  const byItem = new Map(pending.map((p) => [p.itemId, p.barcode]));
  return items.map((item) =>
    byItem.has(item.id) ? { ...item, barcode: byItem.get(item.id) as string } : item
  );
}
