"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
import { useCallback, useEffect, useMemo, useState } from "react";
import { newClientRef, receiptNumber } from "@/lib/ids";
import { changeDue, formatGHS } from "@/lib/money";
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
  type LocalSale,
  type OutboxItem,
  type StorageHealth,
} from "@/lib/pos/db";
import {
  currentStatus,
  drainOutbox,
  pendingCount,
  retryFailed,
  stuckItems,
  startAutoSync,
  statusText,
  type SyncStatus,
} from "@/lib/pos/outbox";
import {
  clearRegistration,
  getDeviceContext,
  isRegistered,
  leaseExpired,
  pullCatalogue,
  startCatalogueRefresh,
  type DeviceContext,
} from "@/lib/pos/registration";
import TerminalSetup from "@/components/pos/TerminalSetup";
import ShiftGate from "@/components/pos/ShiftGate";
import ShiftClose from "@/components/pos/ShiftClose";
import { getActiveShift, type LocalShift } from "@/lib/pos/shift";
import { categoryTint, monogram, stockTone, tileSurface } from "@/lib/pos/tint";
import HeldSheet from "@/components/pos/HeldSheet";
import StaffPin from "@/components/pos/StaffPin";
import ScanSheet from "@/components/pos/ScanSheet";
import TillNotReady from "@/components/pos/TillNotReady";
import TileImage from "@/components/pos/TileImage";
import { syncCatalogueImages } from "@/lib/pos/images";
import { attachBarcodeLocally } from "@/lib/pos/barcode";
import { Eyebrow } from "@/components/brand/Mark";
import { getPrinter } from "@/lib/pos/printer";
import type { ReceiptDoc } from "@/lib/pos/receipt";
import {
  activeCashier,
  pullRoster,
  signOutCashier,
  type ActiveCashier,
} from "@/lib/pos/staff";
import {
  discardHeld,
  holdSale,
  listHeld,
  resumeHeld,
  type HeldSale,
} from "@/lib/pos/held";

// Ascend POS Terminal Mode: fast, restricted, genuinely offline-capable
// (CHN-003, POS-002, POS PRD §17). The sale is persisted to the device and
// queued before the cashier is told it worked; nothing here depends on the
// network being up.

interface CartLine {
  item: LocalItem;
  quantity: number;
}

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
function tillPrefix(device: DeviceContext | undefined): string {
  if (device?.deviceNumber) return `T${String(device.deviceNumber).padStart(2, "0")}`;
  if (device?.deviceId) return `T${device.deviceId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  return "T01";
}

export default function PosTerminal() {
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Why it is unavailable, because the two causes have different fixes and
  // one of them the cashier can do themselves in five seconds.
  const [blockedByOtherTab, setBlockedByOtherTab] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [device, setDevice] = useState<DeviceContext | undefined>();
  const [revoked, setRevoked] = useState(false);
  const [shift, setShift] = useState<LocalShift | undefined>();
  const [closing, setClosing] = useState(false);
  const [catalogue, setCatalogue] = useState<LocalItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [tendered, setTendered] = useState("");
  const [status, setStatus] = useState<SyncStatus>({ kind: "idle", pending: 0 });
  const [storage, setStorage] = useState<StorageHealth | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{
    number: string;
    total: number;
    doc: ReceiptDoc;
  } | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [cashier, setCashier] = useState<ActiveCashier | undefined>();
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [scanning, setScanning] = useState(false);
  // A pairing code arriving in the address on a till that is already paired.
  // Someone opened the link meaning "make this device that till", and
  // ignoring it silently is how an owner concludes the link is broken.
  const [codeInLink, setCodeInLink] = useState<string | null>(null);
  const [switchUnsent, setSwitchUnsent] = useState<number | null>(null);
  // Sales the server refused outright. They stay on the till, so they are
  // recoverable, but nothing used to say they existed.
  const [stuck, setStuck] = useState<
    Array<{ clientRef: string; kind: string; lastError: string | null; tries: number }>
  >([]);
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
  }, []);

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("code");
    if (linked) setCodeInLink(linked.toUpperCase());
  }, []);

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
        setBlockedByOtherTab(
          message === "indexeddb_blocked" || message === "indexeddb_timeout"
        );
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

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + l.item.price * l.quantity, 0),
    [cart]
  );

  const categories = useMemo(() => {
    const found = Array.from(
      new Set(catalogue.map((i) => i.category).filter(Boolean) as string[])
    ).sort();
    return found.length > 0 ? ["All", ...found] : [];
  }, [catalogue]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalogue, query, category]);

  function addToCart(item: LocalItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        // Repeated identical selection increments quantity (POS §14.2)
        return prev.map((l) =>
          l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
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

  // Park the basket so the queue behind can be served (POS-016). Nothing
  // is sold, so nothing leaves stock.
  async function parkSale() {
    if (cart.length === 0) return;
    const parked = await holdSale(cart.map((l) => ({ item: l.item, quantity: l.quantity })));
    if (!parked) return;
    setCart([]);
    setCheckout(false);
    setHeld(await listHeld());
  }

  async function bringBack(id: string) {
    const resumed = await resumeHeld(id);
    if (!resumed) return;
    setCart(resumed.lines.map((l) => ({ item: l.item, quantity: l.quantity })));
    setShowHeld(false);
    setHeld(await listHeld());
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

  async function completeCashSale() {
    const paid = parseFloat(tendered);
    if (!(paid >= total) || cart.length === 0 || saving) return;

    setSaving(true);
    setError(null);
    try {
      // Device-scoped receipt sequence, persisted so restarts never reissue
      // a number (POS-RCP-008).
      const seq = ((await getMeta<number>("receiptSeq")) ?? 0) + 1;
      const now = new Date();
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
          lineTotal: Math.round(l.item.price * l.quantity * 100) / 100,
          trackStock: l.item.trackStock,
        })),
        payments: [{ seq: "0", method: "cash", amount: total, tendered: paid }],
        occurredAt: now.toISOString(),
        businessDate,
        shiftId: shift?.clientRef,
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
          shiftClientRef: shift?.clientRef,
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
          amount: Math.round(l.item.price * l.quantity * 100) / 100,
        })),
        subtotal: total,
        total,
        paymentMethod: "Cash",
        tendered: paid,
        change: Math.round((paid - total) * 100) / 100,
      };

      setLastReceipt({ number: receiptNo, total, doc });
      // Printing follows the sale, it never gates it: the money is taken
      // and the record is on disk whatever the printer does.
      printReceipt(doc);
      setHeld(await listHeld());
      setCart([]);
      setTendered("");
      setCheckout(false);
      refreshStatus();
      drainOutbox().then(refreshStatus).catch(() => {});
    } catch {
      setError("That sale did not save. Do not hand over the goods, tap finish again.");
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

  // A till whose lease has run out must reach the server before selling
  // again; a revoked one is done until an owner re-pairs it (POS-OFF-006,
  // OFL-013). Completed sales stay on the device either way.
  const locked = revoked || leaseExpired(device);

  if (ready && registered === false) {
    return <TerminalSetup onPaired={() => { setRegistered(true); boot(); }} />;
  }

  // Arrived with a pairing code on a till that is already set up. Offer the
  // swap rather than pretending the code was not there.
  if (ready && registered && codeInLink) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-6 text-white">
        <div className="w-full max-w-sm text-center">
          <Eyebrow tone="mint">{device?.label ?? "Ascend POS"}</Eyebrow>
          <h1 className="mt-3 text-xl font-extrabold">
            This device is already {device?.label ?? "a till"}.
          </h1>
          <p className="mt-2 text-sm text-on-dark">
            You opened a pairing code here. Setting this device up as the new
            till stops it being {device?.label ?? "this one"}.
          </p>

          {switchUnsent && switchUnsent > 0 ? (
            <p className="mt-4 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-ink">
              It still has {switchUnsent} sale{switchUnsent === 1 ? "" : "s"} to
              send. Get back on network first, or those are lost.
            </p>
          ) : (
            <button
              onClick={async () => {
                const waiting = await pendingCount().catch(() => 0);
                if (waiting > 0) {
                  setSwitchUnsent(waiting);
                  return;
                }
                await clearRegistration();
                window.location.href = `/pos?code=${encodeURIComponent(codeInLink)}`;
              }}
              className="tap mt-5 w-full rounded-control bg-teal py-3.5 font-semibold"
            >
              Set this device up as the new till
            </button>
          )}

          <button
            onClick={() => {
              setCodeInLink(null);
              window.history.replaceState({}, "", "/pos");
            }}
            className="tap mt-3 w-full rounded-control border border-white/25 py-3 text-sm font-bold"
          >
            No, keep selling as {device?.label ?? "this till"}
          </button>
        </div>
      </main>
    );
  }

  // Who is at the till, before anything is sold in their name (POS-014).
  if (ready && registered && !cashier && !locked) {
    return (
      <StaffPin
        businessLabel={device?.label}
        onSignedIn={(signedIn) => {
          setCashier(signedIn);
          boot();
        }}
      />
    );
  }

  // Sales belong to a shift, so the drawer can be reconciled at the end of
  // the day (POS-SHF-001).
  if (ready && registered && !shift && !locked) {
    return <ShiftGate onOpened={boot} cashierMembershipId={cashier?.membershipId} />;
  }

  if (ready && shift && closing) {
    return (
      <ShiftClose
        cashierMembershipId={cashier?.membershipId}
        shift={shift}
        onCancel={() => setClosing(false)}
        onClosed={async () => {
          setClosing(false);
          setCart([]);
          setLastReceipt(null);
          // Closing a shift is the handover. The drawer has just been
          // counted and handed on, so the till forgets who was standing
          // here and the next person enters their own PIN. Without this the
          // next shift is opened in the last cashier's name and every sale
          // in it says they served, which is the exact confusion that
          // putting a name on a receipt exists to prevent.
          await signOutCashier();
          setCashier(undefined);
          boot();
          drainOutbox().then(refreshStatus).catch(() => {});
        }}
      />
    );
  }

  if (ready && locked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">
            {revoked ? "This till has been stopped." : "This till needs to check in."}
          </h1>
          <p className="mt-3 text-white/70">
            {revoked
              ? "The owner stopped this till. Your saved sales are safe on this device. Call the owner to set it up again."
              : "It has been selling offline for a while. Connect to network once and it will keep going."}
          </p>
          {status.pending > 0 && (
            <p className="mt-3 text-gold">
              {status.pending} sale{status.pending === 1 ? "" : "s"} still saved here.
            </p>
          )}
          {!revoked && (
            <button
              onClick={syncNow}
              className="tap mt-6 w-full bg-teal py-3.5 font-semibold"
            >
              Check in now
            </button>
          )}
        </div>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
        <div className="max-w-sm text-center">
          {blockedByOtherTab ? (
            <>
              <h1 className="text-xl font-semibold">
                The till is open somewhere else.
              </h1>
              <p className="mt-3 text-white/70">
                Close the other tab or window showing this till, then tap
                below. Your sales are safe.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="tap mt-5 w-full rounded-control bg-teal py-3.5 font-semibold"
              >
                I have closed it, open the till
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">
                This till cannot save sales here.
              </h1>
              <p className="mt-3 text-white/70">
                The browser is blocking local storage, so a sale could be lost.
                Open the till in the Ascend app, or turn off private browsing.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-navy text-white">
      {/* Status strip: connectivity and queue depth, in plain words */}
      <header className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setClosing(true)}
            className="tap flex items-center px-1 font-medium"
          >
            {device?.label ?? "Till"}
          </button>
          {cashier && (
            <button
              onClick={async () => {
                // Handing over clears the basket too: the next person must
                // not inherit someone else's half-finished sale.
                await signOutCashier();
                setCart([]);
                setCheckout(false);
                setCashier(undefined);
              }}
              className="tap flex items-center rounded-chip bg-white/10 px-3 text-xs font-bold text-on-dark"
            >
              {cashier.displayName.split(" ")[0]} · hand over
            </button>
          )}
          {held.length > 0 && (
            <button
              onClick={() => setShowHeld(true)}
              className="tap flex items-center rounded-chip bg-white/10 px-3 text-xs font-bold text-teal-mint"
            >
              {held.length} parked
            </button>
          )}
        </div>
        <button
          onClick={syncNow}
          className={`tap px-2 ${
            status.kind === "needs_attention" || status.pending > 0
              ? "text-gold"
              : "text-teal-light"
          }`}
        >
          {statusText(status)}
        </button>
      </header>

      {/* Sales the server refused. They are safe on this till, but nothing
          used to say they existed, so a merchant saw a number that never
          fell and had nothing to do about it. */}
      {stuck.length > 0 && (
        <div className="mx-4 mb-2 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-ink">
          <p className="font-bold">
            {stuck.length} thing{stuck.length === 1 ? "" : "s"} the office is not
            taking.
          </p>
          <p className="mt-1">
            {stuck[0].lastError?.includes("receipt_number") ||
            stuck[0].lastError?.includes("duplicate key")
              ? "Their receipt numbers were already used. The office can give them new ones once this till is updated."
              : (stuck[0].lastError ?? "The office did not say why.")}
          </p>
          {/* The exact words the server used, because a merchant on the phone
              to support should be able to read them out. */}
          <p className="mono mt-1 text-[11px] opacity-70">
            {stuck[0].kind} · tried {stuck[0].tries} times · {stuck[0].lastError ?? "no reason given"}
          </p>
          <button
            onClick={async () => {
              await retryFailed();
              await drainOutbox(true);
              refreshStatus();
            }}
            className="tap mt-2 rounded-control bg-gold-dark px-4 py-2 text-sm font-semibold text-white"
          >
            Try sending them again
          </button>
        </div>
      )}

      {storage?.critical && (
        <p className="mx-4 mb-2 bg-gold px-3 py-2 text-sm font-semibold text-navy">
          This till is almost full. Send your sales and call support today.
        </p>
      )}

      {error && (
        <p className="mx-4 mb-2 bg-gold-light px-3 py-2 text-sm text-gold-ink">{error}</p>
      )}

      {lastReceipt && (
        <div className="mx-4 mb-2 rounded-panel bg-teal-dark px-4 py-3 text-sm">
          <p className="font-medium">
            Sale done. Receipt {lastReceipt.number} · {formatGHS(lastReceipt.total)}
          </p>
          <p className="text-teal-light">
            Saved on this till. It sends itself when the network returns.
          </p>
          {printNote && <p className="mt-1 text-gold">{printNote}</p>}
          <button
            onClick={() => printReceipt(lastReceipt.doc)}
            className="tap mt-2 rounded-chip bg-white/15 px-3 py-1 text-xs font-bold"
          >
            Print the receipt again
          </button>
        </div>
      )}

      {/* Find an item: search by name, or narrow to a category. Both matter
          when the grid is longer than one screen (POS-003). */}
      {ready && catalogue.length > 0 && (
        <div className="px-4 pb-1">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your items"
              className="flex-1 rounded-control bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-teal-mint"
              aria-label="Search items"
            />
            <button
              onClick={() => setScanning(true)}
              className="tap shrink-0 rounded-control bg-white/10 px-4 font-bold text-teal-mint"
            >
              Scan
            </button>
          </div>
          {categories.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`tap shrink-0 rounded-chip px-3 text-sm font-bold transition-colors ${
                    category === cat
                      ? "bg-teal text-white"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Item tiles: large tap targets, minimal depth (POS-002, POS-003).
          Category tint and monogram let a cashier find an item by shape and
          colour before reading the label. */}
      {/* A cashier finds an item by its picture, then confirms with the
          name, price and what is left. The picture has to be recognisable,
          not large: it was taking a whole screen for three products, which
          turns finding into scrolling. */}
      <section className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {!ready && <p className="col-span-full text-white/60">Opening your till...</p>}
        {/* An empty catalogue and an empty search result are different
            problems. Telling someone to clear a search they never typed is
            how a merchant concludes the till is broken. */}
        {ready && catalogue.length === 0 && (
          <div className="col-span-full">
            <TillNotReady
              reason="no_products"
              businessLabel={device?.label}
              onRetry={async () => {
                const { ok } = await pullCatalogue();
                if (ok) setCatalogue(await getAll<LocalItem>(STORE.catalogue));
              }}
            />
          </div>
        )}
        {ready && catalogue.length > 0 && visibleItems.length === 0 && (
          <p className="col-span-full py-8 text-center text-white/60">
            Nothing matches that. Clear the search to see everything.
          </p>
        )}
        {ready &&
          visibleItems.map((item) => {
            const [, tintInk] = categoryTint(item.category);
            const tone = stockTone(item.localStock, item.lowStockThreshold);
            const soldOut = tone === "out";
            return (
              <button
                key={item.id}
                onClick={() => !soldOut && addToCart(item)}
                disabled={soldOut}
                className="tap flex flex-col overflow-hidden rounded-panel text-left transition-transform active:scale-[0.98] disabled:opacity-45"
              >
                <span
                  className="flex h-20 shrink-0 items-center justify-center overflow-hidden sm:h-24"
                  style={tileSurface(item.category)}
                >
                  {item.photoUrl ? (
                    <TileImage
                      url={item.photoUrl}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span
                      className="text-[22px] font-extrabold tracking-[-0.02em]"
                      style={{ color: tintInk }}
                    >
                      {monogram(item.name)}
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 bg-white/10 px-3 py-2">
                  <span className="truncate text-[13px] font-semibold leading-snug">
                    {item.name}
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="num text-[15px] font-bold">
                      {formatGHS(item.price)}
                    </span>
                    {item.trackStock && item.localStock !== undefined && (
                      <span
                        className={`num text-[11px] font-semibold ${
                          soldOut
                            ? "text-gold"
                            : tone === "low"
                              ? "text-gold"
                              : "text-white/55"
                        }`}
                      >
                        {soldOut ? "None left" : `${item.localStock} left`}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
      </section>

      {/* Cart */}
      {cart.length > 0 && !checkout && (
        <section className="border-t border-white/15 bg-navy px-4 pb-4 pt-3">
          {cart.map((line) => (
            <div key={line.item.id} className="flex items-center justify-between py-1.5">
              <span className="flex-1 truncate pr-2 text-sm">{line.item.name}</span>
              <div className="flex items-center gap-3">
                <button
                  className="tap w-11 bg-white/10 text-lg"
                  onClick={() => setQuantity(line.item.id, line.quantity - 1)}
                  aria-label={`Reduce ${line.item.name}`}
                >
                  −
                </button>
                <span className="w-6 text-center">{line.quantity}</span>
                <button
                  className="tap w-11 bg-white/10 text-lg"
                  onClick={() => setQuantity(line.item.id, line.quantity + 1)}
                  aria-label={`Add ${line.item.name}`}
                >
                  +
                </button>
                <span className="num w-20 text-right text-sm">
                  {formatGHS(line.item.price * line.quantity)}
                </span>
              </div>
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <button
              onClick={parkSale}
              className="tap rounded-control border border-white/25 px-4 text-sm font-bold text-white/80"
            >
              Park it
            </button>
            <button
              onClick={() => setCheckout(true)}
              className="num tap flex-1 rounded-control bg-teal py-4 text-lg font-semibold transition-colors active:bg-teal-dark"
            >
              Take payment · {formatGHS(total)}
            </button>
          </div>
        </section>
      )}

      {/* Cash checkout: change calculated for the cashier (POS-PAY-002) */}
      {checkout && (
        <section className="border-t border-white/15 bg-navy px-4 pb-6 pt-4">
          <p className="text-sm text-white/70">Cash received</p>
          <input
            inputMode="decimal"
            autoFocus
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            placeholder="How much did they give you?"
            className="num mt-2 w-full rounded-control bg-white/10 px-4 py-3 text-2xl font-semibold text-white placeholder:text-base placeholder:font-normal placeholder:text-white/60 focus:outline-none"
          />
          {parseFloat(tendered) >= total && (
            <p className="mt-2 text-lg">
              Change due:{" "}
              <span className="num font-semibold text-gold">
                {formatGHS(changeDue(parseFloat(tendered), total))}
              </span>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCheckout(false)}
              className="tap flex-1 border border-white/30 py-3.5 font-medium"
            >
              Back to cart
            </button>
            <button
              onClick={completeCashSale}
              disabled={!(parseFloat(tendered) >= total) || saving}
              className="tap flex-[2] bg-teal py-3.5 text-lg font-semibold disabled:opacity-40"
            >
              {saving ? "Saving..." : "Finish sale"}
            </button>
          </div>
        </section>
      )}

      {scanning && (
        <ScanSheet
          catalogue={catalogue}
          onAdd={addToCart}
          onAttach={async (itemId, barcode) => {
            // Written locally and queued, so the till recognises the product
            // from the very next scan even with no network.
            const updated = await attachBarcodeLocally(
              itemId,
              barcode,
              cashier?.membershipId
            );
            if (updated) {
              setCatalogue((prev) =>
                prev.map((i) => (i.id === updated.id ? updated : i))
              );
            }
            refreshStatus();
            drainOutbox().then(refreshStatus).catch(() => {});
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {showHeld && (
        <HeldSheet
          held={held}
          onResume={bringBack}
          onDiscard={throwAway}
          onClose={() => setShowHeld(false)}
        />
      )}
    </main>
  );
}
