"use client";

// The till's engine: everything a till does except how it looks.
//
// Both layouts (the Counter on a big screen, the Terminal in the hand) run
// on this one hook, so a sale is saved, queued and counted the same way
// whichever screen rang it up. The sale is persisted to the device and
// queued before the cashier is told it worked; nothing here depends on the
// network being up (CHN-003, POS-002, POS PRD §17).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  commitSaleLocally,
  getAll,
  getMeta,
  replaceCatalogue,
  requestDurableStorage,
  setMeta,
  storageHealth,
  STORE,
  type LocalItem,
  type StorageHealth,
} from "@/lib/pos/db";
import {
  currentStatus,
  drainOutbox,
  retryFailed,
  stuckItems,
  startAutoSync,
  type SyncStatus,
} from "@/lib/pos/outbox";
import {
  getDeviceContext,
  isRegistered,
  leaseExpired,
  pullCatalogue,
  startCatalogueRefresh,
  type DeviceContext,
} from "@/lib/pos/registration";
import { getActiveShift, type LocalShift } from "@/lib/pos/shift";
import { syncCatalogueImages } from "@/lib/pos/images";
import { attachBarcodeLocally } from "@/lib/pos/barcode";
import { getPrinter } from "@/lib/pos/printer";
import type { ReceiptDoc } from "@/lib/pos/receipt";
import { activeCashier, pullRoster, signOutCashier, type ActiveCashier } from "@/lib/pos/staff";
import { discardHeld, holdSale, listHeld, resumeHeld, type HeldSale } from "@/lib/pos/held";
import { buildSale, cartTotal, type CartLine, type TillPayment } from "@/lib/pos/sale";

export type { CartLine } from "@/lib/pos/sale";

// Seeded on first run so a terminal is usable before catalogue sync exists.
const SEED_CATALOGUE: LocalItem[] = [
  { id: "seed-1", name: "Sachet water (bag)", price: 5, trackStock: true, localStock: 42, category: "Drinks" },
  { id: "seed-2", name: "Gari (olonka)", price: 18, trackStock: true, localStock: 15, category: "Groceries" },
  { id: "seed-3", name: "Milo 400g", price: 38, trackStock: true, localStock: 8, category: "Groceries" },
  { id: "seed-4", name: "Ideal Milk", price: 9.5, trackStock: true, localStock: 30, category: "Groceries" },
  { id: "seed-5", name: "Sugar (kg)", price: 14, trackStock: true, localStock: 22, category: "Groceries" },
  { id: "seed-6", name: "Bar soap", price: 3.5, trackStock: true, localStock: 80, category: "Household" },
  { id: "seed-7", name: "Toilet roll 4pk", price: 15, trackStock: true, localStock: 4, category: "Household" },
  { id: "seed-8", name: "Delivery fee", price: 10, trackStock: false, category: "Services" },
];

export interface LastReceipt {
  number: string;
  total: number;
  doc: ReceiptDoc;
}

export type StuckItem = { clientRef: string; kind: string; lastError: string | null; tries: number };

export function useTill() {
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Why it is unavailable, because the two causes have different fixes and
  // one of them the cashier can do themselves in five seconds.
  const [blockedByOtherTab, setBlockedByOtherTab] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [device, setDevice] = useState<DeviceContext | undefined>();
  const [revoked, setRevoked] = useState(false);
  const [shift, setShift] = useState<LocalShift | undefined>();
  const [catalogue, setCatalogue] = useState<LocalItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [status, setStatus] = useState<SyncStatus>({ kind: "idle", pending: 0 });
  const [storage, setStorage] = useState<StorageHealth | null>(null);
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [cashier, setCashier] = useState<ActiveCashier | undefined>();
  const [held, setHeld] = useState<HeldSale[]>([]);
  // Sales the server refused outright. They stay on the till, so they are
  // recoverable, but nothing used to say they existed.
  const [stuck, setStuck] = useState<StuckItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    currentStatus().then(setStatus).catch(() => {});
    storageHealth().then(setStorage).catch(() => {});
    stuckItems().then(setStuck).catch(() => {});
  }, []);

  // Boot: open the local store, seed the catalogue on first run, ask for
  // durable storage so queued sales survive disk pressure, then start
  // background sync.
  const boot = useCallback(async () => {
    const paired = await isRegistered();
    setRegistered(paired);
    setShift(await getActiveShift());
    setHeld(await listHeld());
    setCashier(await activeCashier());
    if (paired) {
      setDevice(await getDeviceContext());
      // Refresh prices and stock when there is network; the till keeps its
      // last known catalogue when there is not.
      pullCatalogue()
        .then(async ({ ok }) => {
          if (!ok) return;
          const items = await getAll<LocalItem>(STORE.catalogue);
          setCatalogue(items);
          // Photos come after the catalogue, in the background. A cashier
          // can already sell by this point; pictures are what makes the
          // shelf recognisable, not what makes it work.
          syncCatalogueImages(items).catch(() => {});
        })
        .catch(() => {});
      // The roster is what lets the till name its cashier with no network.
      pullRoster().catch(() => {});
    }

    const existing = await getAll<LocalItem>(STORE.catalogue);
    if (existing.length === 0 && !paired) {
      await replaceCatalogue(SEED_CATALOGUE);
      setCatalogue(SEED_CATALOGUE);
    } else {
      setCatalogue(existing);
      // Reconciled against what the till already holds, not against what a
      // pull returned. A till that is offline, or whose lease has lapsed,
      // never completes a pull, and would otherwise keep the photos of
      // products it no longer sells forever, on the device least able to
      // spare the room.
      syncCatalogueImages(existing).catch(() => {});
    }
    // Whatever the till said about itself before this boot (before it was
    // paired, say) is out of date now. Without this, a till that had just
    // been set up went on saying "This till is not set up yet" while it sold.
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let stopCatalogue: (() => void) | undefined;

    (async () => {
      try {
        await boot();
        await requestDurableStorage();
        setReady(true);
        stopSync = startAutoSync(refreshStatus);
        // The shelf follows the owner's phone, without anyone reloading.
        stopCatalogue = startCatalogueRefresh(async () => {
          const items = await getAll<LocalItem>(STORE.catalogue);
          setCatalogue(items);
          syncCatalogueImages(items).catch(() => {});
        });
      } catch (err) {
        // No IndexedDB means we cannot promise a sale is safe, so we say so
        // rather than pretending to sell.
        const message = err instanceof Error ? err.message : "";
        setBlockedByOtherTab(message === "indexeddb_blocked" || message === "indexeddb_timeout");
        setUnavailable(true);
      }
    })();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      stopSync?.();
      stopCatalogue?.();
    };
  }, [refreshStatus, boot]);

  const total = useMemo(() => cartTotal(cart), [cart]);

  function addToCart(item: LocalItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        // Repeated identical selection increments quantity (POS §14.2)
        return prev.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { item, quantity: 1 }];
    });
  }

  function setQuantity(itemId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.item.id !== itemId)
        : prev.map((l) => (l.item.id === itemId ? { ...l, quantity } : l))
    );
  }

  function clearCart() {
    setCart([]);
  }

  // Park the basket so the queue behind can be served (POS-016). Nothing
  // is sold, so nothing leaves stock. True when it was parked.
  async function parkSale(): Promise<boolean> {
    if (cart.length === 0) return false;
    const parked = await holdSale(cart.map((l) => ({ item: l.item, quantity: l.quantity })));
    if (!parked) return false;
    setCart([]);
    setHeld(await listHeld());
    return true;
  }

  async function bringBack(id: string): Promise<boolean> {
    const resumed = await resumeHeld(id);
    if (!resumed) return false;
    setCart(resumed.lines.map((l) => ({ item: l.item, quantity: l.quantity })));
    setHeld(await listHeld());
    return true;
  }

  async function throwAway(id: string) {
    await discardHeld(id);
    setHeld(await listHeld());
  }

  async function printReceipt(doc: ReceiptDoc) {
    setPrintNote(null);
    try {
      const printer = await getPrinter();
      const result = await printer.print(doc);
      if (!result.ok && result.message) setPrintNote(result.message);
    } catch {
      setPrintNote("The receipt did not print. The sale is saved.");
    }
  }

  /** Saves the sale on the device and queues it. True when it is safe. */
  async function completeSale(payment: TillPayment): Promise<boolean> {
    if (cart.length === 0 || saving) return false;
    if (payment.method === "cash" && !(payment.tendered >= total)) return false;

    setSaving(true);
    setError(null);
    try {
      // Device-scoped receipt sequence, persisted so restarts never reissue
      // a number (POS-RCP-008).
      const seq = ((await getMeta<number>("receiptSeq")) ?? 0) + 1;
      const { sale, outboxItem, doc } = buildSale({
        cart,
        payment,
        seq,
        now: new Date(),
        device,
        shiftClientRef: shift?.clientRef,
        cashier,
      });

      // Durable before success: if the app dies right here, the sale and its
      // queue entry are both already on disk (POS-OFF-001).
      await commitSaleLocally(sale, outboxItem);
      await setMeta("receiptSeq", seq);

      // Local stock reflects the sale immediately so the next customer sees
      // truthful counts even offline.
      setCatalogue((prev) =>
        prev.map((item) => {
          const line = sale.lines.find((l) => l.itemId === item.id);
          if (!line || !item.trackStock || item.localStock === undefined) return item;
          return { ...item, localStock: item.localStock - line.quantity };
        })
      );

      setLastReceipt({ number: sale.receiptNumber, total: sale.total, doc });
      // Printing follows the sale, it never gates it: the money is taken
      // and the record is on disk whatever the printer does.
      printReceipt(doc);
      setHeld(await listHeld());
      setCart([]);
      refreshStatus();
      drainOutbox().then(refreshStatus).catch(() => {});
      return true;
    } catch {
      setError("That sale did not save. Do not hand over the goods, tap finish again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setError(null);
    const outcome = await drainOutbox(true);
    refreshStatus();
    if (outcome.revoked) {
      setRevoked(true);
    } else if (outcome.blocked) {
      setError("Some sales could not be sent. Call support with your till number.");
    }
  }

  async function resendStuck() {
    await retryFailed();
    await drainOutbox(true);
    refreshStatus();
  }

  async function attachBarcode(itemId: string, barcode: string) {
    // Written locally and queued, so the till recognises the product from
    // the very next scan even with no network.
    const updated = await attachBarcodeLocally(itemId, barcode, cashier?.membershipId);
    if (updated) setCatalogue((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    refreshStatus();
    drainOutbox().then(refreshStatus).catch(() => {});
  }

  async function retryCatalogue() {
    const { ok } = await pullCatalogue();
    if (ok) setCatalogue(await getAll<LocalItem>(STORE.catalogue));
  }

  // Handing over clears the basket too: the next person must not inherit
  // someone else's half-finished sale.
  async function handOver() {
    await signOutCashier();
    setCart([]);
    setCashier(undefined);
  }

  // Closing a shift is the handover. The drawer has just been counted and
  // handed on, so the till forgets who was standing here and the next
  // person enters their own PIN. Without this the next shift is opened in
  // the last cashier's name and every sale in it says they served, which is
  // the exact confusion that putting a name on a receipt exists to prevent.
  async function afterShiftClosed() {
    setCart([]);
    setLastReceipt(null);
    await signOutCashier();
    setCashier(undefined);
    await boot();
    drainOutbox().then(refreshStatus).catch(() => {});
  }

  // A till whose lease has run out must reach the server before selling
  // again; a revoked one is done until an owner re-pairs it (POS-OFF-006,
  // OFL-013). Completed sales stay on the device either way.
  const locked = revoked || leaseExpired(device);

  return {
    ready,
    unavailable,
    blockedByOtherTab,
    registered,
    setRegistered,
    device,
    revoked,
    locked,
    shift,
    catalogue,
    cart,
    total,
    status,
    storage,
    stuck,
    lastReceipt,
    printNote,
    cashier,
    setCashier,
    held,
    saving,
    error,
    boot,
    addToCart,
    setQuantity,
    clearCart,
    parkSale,
    bringBack,
    throwAway,
    printReceipt,
    completeSale,
    syncNow,
    resendStuck,
    attachBarcode,
    retryCatalogue,
    handOver,
    afterShiftClosed,
  };
}

export type Till = ReturnType<typeof useTill>;
