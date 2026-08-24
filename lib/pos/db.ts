// Local terminal database (POS PRD §17). Offline-first means the POS
// completes real operations without the server, not that it shows cached
// data: a sale is persisted here before the cashier is told it succeeded
// (POS-OFF-001), and everything survives a restart or a killed app
// (POS-OFF-008).
//
// The schema is versioned so an app update migrates the store instead of
// discarding queued work (POS-OFF-012).

const DB_NAME = "ascend-pos";
const DB_VERSION = 2;

export const STORE = {
  catalogue: "catalogue",
  /** Product photos as blobs, so a till with no network still shows them. */
  images: "images",
  sales: "sales",
  outbox: "outbox",
  shift: "shift",
  meta: "meta",
} as const;

export type OutboxState = "pending" | "syncing" | "failed" | "synced";

// Each outbox item carries its own state, retry count, timestamps and last
// error so the merchant and support can see exactly where a sale is stuck
// (POS-OFF-004).
export interface OutboxItem {
  clientRef: string;
  kind:
    | "sale.completed"
    | "shift.opened"
    | "shift.closed"
    | "catalogue.barcode.attached";
  payload: unknown;
  state: OutboxState;
  retryCount: number;
  createdAt: string;
  lastAttemptAt: string | null;
  nextAttemptAt: string;
  lastError: string | null;
  serverId?: string;
}

export interface LocalSale {
  clientRef: string;
  receiptNumber: string;
  total: number;
  currencyCode: string;
  lines: Array<{
    itemId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    trackStock: boolean;
  }>;
  payments: Array<{
    seq: string;
    method: string;
    amount: number;
    tendered?: number;
  }>;
  occurredAt: string;
  businessDate: string;
  shiftId?: string;
  synced: boolean;
  serverId?: string;
}

export interface LocalItem {
  /** Product photo, stored once and cached by the browser thereafter. */
  photoUrl?: string | null;
  id: string;
  name: string;
  price: number;
  trackStock: boolean;
  localStock?: number;
  barcode?: string | null;
  category?: string | null;
  lowStockThreshold?: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // A last resort. Browsers have been known to leave an open request
    // pending with no event at all, and a till that hangs on a black screen
    // is worse than one that says what is wrong.
    const giveUp = setTimeout(() => reject(new Error("indexeddb_timeout")), 10_000);
    const settle = <T,>(fn: (value: T) => void) => (value: T) => {
      clearTimeout(giveUp);
      fn(value);
    };
    resolve = settle(resolve);
    reject = settle(reject);

    // Migrations are additive and keyed on the old version, so an upgrade
    // never drops a store that may hold unsynced sales.
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const from = event.oldVersion;

      if (from < 1) {
        db.createObjectStore(STORE.catalogue, { keyPath: "id" });
        const sales = db.createObjectStore(STORE.sales, { keyPath: "clientRef" });
        sales.createIndex("businessDate", "businessDate");
        sales.createIndex("synced", "synced");
        const outbox = db.createObjectStore(STORE.outbox, { keyPath: "clientRef" });
        outbox.createIndex("state", "state");
        db.createObjectStore(STORE.shift, { keyPath: "id" });
        db.createObjectStore(STORE.meta, { keyPath: "key" });
      }

      // Additive, keyed on the old version, so a till upgrading with sales
      // still queued keeps every one of them (POS-OFF-012).
      if (from < 2) {
        db.createObjectStore(STORE.images, { keyPath: "url" });
      }
    };

    // An open that needs to upgrade is blocked while any other connection
    // still holds the old version. Without this handler the request fires
    // neither success nor error, the promise never settles, and the till
    // sits on "Opening your till" forever with no way out. Which is exactly
    // what a version bump did to a till with a second tab open.
    request.onblocked = () => {
      reject(new Error("indexeddb_blocked"));
    };

    request.onsuccess = () => {
      const db = request.result;
      // Release the database when another tab wants to upgrade, so the
      // upgrade is never the thing that hangs. Sales already written are
      // safe; anything mid-flight fails loudly rather than silently.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });

  // A rejected open must not be remembered, or a till blocked once stays
  // broken until the app is killed even after the other tab closes.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        // Resolve on transaction completion, not request success: the write
        // is only durable once the transaction commits (POS-OFF-001).
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

export function put<T>(storeName: string, value: T): Promise<unknown> {
  return tx(storeName, "readwrite", (store) => store.put(value as never));
}

export function get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return tx<T | undefined>(storeName, "readonly", (store) => store.get(key) as IDBRequest<T | undefined>);
}

export function getAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, "readonly", (store) => store.getAll() as IDBRequest<T[]>);
}

export function remove(storeName: string, key: IDBValidKey): Promise<unknown> {
  return tx(storeName, "readwrite", (store) => store.delete(key));
}

// ---------------------------------------------------------------------------
// Atomic sale commit: the sale record and its outbox entry are written in one
// transaction. Either the cashier's sale is fully durable and queued, or
// nothing is written and the sale is not reported as complete (POS-OFF-001).
// ---------------------------------------------------------------------------
export async function commitSaleLocally(
  sale: LocalSale,
  outboxItem: OutboxItem
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE.sales, STORE.outbox], "readwrite");
    transaction.objectStore(STORE.sales).put(sale);
    transaction.objectStore(STORE.outbox).put(outboxItem);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function replaceCatalogue(items: LocalItem[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE.catalogue, "readwrite");
    const store = transaction.objectStore(STORE.catalogue);
    store.clear();
    for (const item of items) store.put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await put(STORE.meta, { key, value });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await get<{ key: string; value: T }>(STORE.meta, key);
  return row?.value;
}

// ---------------------------------------------------------------------------
// Storage pressure. A terminal that fills its disk mid-shift loses sales, so
// the merchant is warned while there is still room to act (POS-SYN-011).
// ---------------------------------------------------------------------------
export interface StorageHealth {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  critical: boolean;
}

export async function storageHealth(): Promise<StorageHealth | null> {
  if (!isBrowser() || !navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
  return {
    usageBytes: usage,
    quotaBytes: quota,
    percentUsed,
    critical: percentUsed >= 85,
  };
}

// Ask the browser to keep this data through storage pressure. Without it a
// terminal's queued sales can be evicted under disk pressure.
export async function requestDurableStorage(): Promise<boolean> {
  if (!isBrowser() || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}
