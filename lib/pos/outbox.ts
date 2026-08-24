// Terminal sync engine (POS PRD §18). Drains the local outbox to
// /api/pos/sync in dependency order, distinguishes temporary from permanent
// failures (POS-SYN-005), retries with bounded backoff (OFL-007), and never
// blocks the Sell screen (POS-SYN-008).

import {
  getAll,
  getMeta,
  put,
  remove,
  STORE,
  type LocalSale,
  type OutboxItem,
} from "./db";
import { getDeviceToken } from "./registration";

// 1, 4, 9, 16... minutes, capped at 15. A shop that reconnects after a long
// outage should not wait an hour for its sales to land.
function backoffMs(retryCount: number): number {
  const minutes = Math.min((retryCount + 1) ** 2, 15);
  return minutes * 60_000;
}

export interface SyncOutcome {
  attempted: number;
  accepted: number;
  stillPending: number;
  blocked: boolean; // a permanent failure needs someone to look at it
  revoked: boolean; // this till is no longer registered to the business
}

export type SyncStatus =
  | { kind: "idle"; pending: number }
  | { kind: "syncing"; pending: number }
  | { kind: "offline"; pending: number }
  | { kind: "unregistered"; pending: number }
  | { kind: "needs_attention"; pending: number };

const EMPTY_OUTCOME = { attempted: 0, accepted: 0, blocked: false, revoked: false };

let syncing = false;

export async function pendingCount(): Promise<number> {
  const items = await getAll<OutboxItem>(STORE.outbox);
  return items.filter((i) => i.state !== "synced").length;
}

// Drains the queue. Safe to call often: concurrent calls collapse into one,
// and every item is idempotent server-side on its client_ref.

// What the till believes it has issued, and what it still holds. The
// server compares this with what it actually received: sales that are in
// neither place existed once and are now gone, which an owner needs told
// rather than left to discover when the cash does not match (POS-013).
//
// This is reported even when nothing is queued, because an empty queue on
// a till that has issued more receipts than the server holds is precisely
// the case worth catching.
async function reportWatermark(token: string): Promise<void> {
  try {
    const receiptSeqHigh = (await getMeta<number>("receiptSeq")) ?? 0;
    if (receiptSeqHigh === 0) return;
    await fetch("/api/pos/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: [],
        watermark: { receiptSeqHigh, pendingCount: await pendingCount() },
      }),
    });
  } catch {
    // A health report is never worth failing a sync over.
  }
}

export async function drainOutbox(force = false): Promise<SyncOutcome> {
  if (syncing) return { ...EMPTY_OUTCOME, stillPending: await pendingCount() };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ...EMPTY_OUTCOME, stillPending: await pendingCount() };
  }

  // An unpaired till keeps selling and keeps queueing; it simply has nowhere
  // to send yet.
  const token = await getDeviceToken();
  if (!token) return { ...EMPTY_OUTCOME, stillPending: await pendingCount() };

  syncing = true;
  let attempted = 0;
  let accepted = 0;
  let blocked = false;
  let revoked = false;

  try {
    const all = await getAll<OutboxItem>(STORE.outbox);
    const now = Date.now();

    // Dependency order is creation order (POS-SYN-002). A manual sync ignores
    // the backoff clock; the merchant asked for it now (POS-OFF-010).
    const due = all
      .filter((i) => i.state === "pending" || i.state === "syncing")
      .filter((i) => force || new Date(i.nextAttemptAt).getTime() <= now)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const item of due) {
      attempted += 1;
      await put(STORE.outbox, { ...item, state: "syncing" satisfies OutboxItem["state"] });

      let response: Response;
      try {
        response = await fetch("/api/pos/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ items: [{ kind: item.kind, payload: item.payload }] }),
        });
      } catch {
        // Network died mid-drain. Leave the rest queued in order.
        await markTemporary(item, "no network");
        break;
      }

      if (response.status === 401) {
        // The till was revoked or its lease lapsed. Stop trying, keep the
        // sales, and tell the merchant to get the owner (OFL-013).
        await markTemporary(item, "till not active");
        revoked = true;
        break;
      }

      if (!response.ok) {
        // 5xx is the server's problem and will pass; 4xx will not.
        if (response.status >= 500) {
          await markTemporary(item, `server ${response.status}`);
          break;
        }
        await markPermanent(item, `rejected ${response.status}`);
        blocked = true;
        continue;
      }

      const body = (await response.json()) as {
        results: Array<{
          clientRef: string;
          status: "accepted" | "duplicate" | "rejected_temporary" | "rejected_permanent";
          serverId?: string;
          error?: string;
        }>;
      };
      const result = body.results?.[0];

      if (!result) {
        await markTemporary(item, "no result returned");
        break;
      }

      if (result.status === "accepted" || result.status === "duplicate") {
        // Duplicate means an earlier attempt already landed: the sale exists
        // exactly once server-side, so this is success (POS-SYN-001).
        await markSynced(item, result.serverId);
        accepted += 1;
      } else if (result.status === "rejected_temporary") {
        // A sale waiting on its shift is ordinary ordering, so long as the
        // shift is genuinely still in this queue. If it is not, it is never
        // coming: its open was refused back when shifts could not sync at
        // all, and the sale would wait for it forever. A sale recorded
        // without a shift is a great deal better than one never recorded,
        // and sale.shift_id is nullable precisely for this.
        const orphaned = await shiftIsNotComing(item, all);
        if (orphaned) {
          await put(STORE.outbox, orphaned);
          continue;
        }
        await markTemporary(item, result.error ?? "temporary failure");
        break; // preserve order: stop the batch, retry later
      } else {
        await markPermanent(item, result.error ?? "permanently rejected");
        blocked = true;
      }
    }
  } finally {
    syncing = false;
  }

  // Reported after draining, so the counts reflect what actually landed.
  if (!revoked) await reportWatermark(token);

  return { attempted, accepted, stillPending: await pendingCount(), blocked, revoked };
}

async function markSynced(item: OutboxItem, serverId?: string): Promise<void> {
  // The local sale stays on the device as the cashier's record and keeps the
  // server id for support lookups; only the queue entry is retired.
  const sale = await getSale(item.clientRef);
  if (sale) await put(STORE.sales, { ...sale, synced: true, serverId });
  await remove(STORE.outbox, item.clientRef);
}

async function markTemporary(item: OutboxItem, error: string): Promise<void> {
  const retryCount = item.retryCount + 1;
  await put(STORE.outbox, {
    ...item,
    state: "pending" satisfies OutboxItem["state"],
    retryCount,
    lastAttemptAt: new Date().toISOString(),
    nextAttemptAt: new Date(Date.now() + backoffMs(retryCount)).toISOString(),
    lastError: error,
  });
}

// A permanently rejected item stays on the device and visible rather than
// being thrown away: the sale really happened and someone must resolve it
// (POS-SYN-004).
async function markPermanent(item: OutboxItem, error: string): Promise<void> {
  await put(STORE.outbox, {
    ...item,
    state: "failed" satisfies OutboxItem["state"],
    retryCount: item.retryCount + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: error,
  });
}

async function getSale(clientRef: string): Promise<LocalSale | undefined> {
  const sales = await getAll<LocalSale>(STORE.sales);
  return sales.find((s) => s.clientRef === clientRef);
}

export async function currentStatus(): Promise<SyncStatus> {
  const items = await getAll<OutboxItem>(STORE.outbox);
  const pending = items.filter((i) => i.state !== "synced").length;
  if (items.some((i) => i.state === "failed")) return { kind: "needs_attention", pending };
  if (syncing) return { kind: "syncing", pending };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { kind: "offline", pending };
  if (!(await getDeviceToken())) return { kind: "unregistered", pending };
  return { kind: "idle", pending };
}

// Plain language for the terminal strip. Cashiers are not engineers
// (POS-OFF-005, MKT-003).
export function statusText(status: SyncStatus): string {
  switch (status.kind) {
    case "needs_attention":
      return `${status.pending} sale${status.pending === 1 ? "" : "s"} need attention`;
    case "syncing":
      return "Sending your sales...";
    case "offline":
      return status.pending > 0
        ? `No network. ${status.pending} sale${status.pending === 1 ? "" : "s"} saved on this till`
        : "No network. You can still sell";
    case "unregistered":
      return status.pending > 0
        ? `${status.pending} sale${status.pending === 1 ? "" : "s"} saved. Set up this till to send them`
        : "This till is not set up yet";
    default:
      return status.pending > 0
        ? `${status.pending} sale${status.pending === 1 ? "" : "s"} waiting to send`
        : "All sales sent";
  }
}

// Background drain: on reconnect, on tab focus, and on a slow timer. Each
// trigger is cheap because the queue is usually empty.
export function startAutoSync(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const run = () => {
    drainOutbox().then(onChange).catch(() => onChange());
  };

  window.addEventListener("online", run);
  window.addEventListener("focus", run);
  const timer = window.setInterval(run, 60_000);
  run();

  return () => {
    window.removeEventListener("online", run);
    window.removeEventListener("focus", run);
    window.clearInterval(timer);
  };
}

/**
 * Puts permanently rejected items back in the queue.
 *
 * A sale rejected for good used to sit in the outbox forever: counted as
 * unsent, never retried, with no reason shown and no way to act. That is
 * fine for something genuinely unacceptable and wrong for the common case,
 * which was a receipt number the server already held. The server can now
 * renumber those, so the right move is to let the merchant ask again once
 * the site has been updated.
 */
export async function retryFailed(): Promise<number> {
  const items = await getAll<OutboxItem>(STORE.outbox);
  // Both the refused and the endlessly retried: a fresh attempt with the
  // backoff cleared is what the merchant is asking for either way.
  const failed = items.filter(
    (i) => i.state === "failed" || (i.lastError !== null && i.retryCount >= 3)
  );
  const now = new Date().toISOString();
  for (const item of failed) {
    await put(STORE.outbox, {
      ...item,
      state: "pending" satisfies OutboxItem["state"],
      retryCount: 0,
      nextAttemptAt: now,
    });
  }
  return failed.length;
}

/**
 * What is stuck, and why.
 *
 * Refused outright is only half of it. An item the server keeps rejecting
 * as temporary retries forever and never moves, and because it is still
 * pending it looked exactly like one waiting for network. The merchant saw
 * a number that would not fall and no reason for it. Anything that has
 * failed repeatedly is worth showing, whatever the queue calls it.
 */
const STUCK_AFTER_TRIES = 3;

export async function stuckItems(): Promise<
  Array<{ clientRef: string; kind: string; lastError: string | null; tries: number }>
> {
  const items = await getAll<OutboxItem>(STORE.outbox);
  return items
    .filter(
      (i) =>
        i.state === "failed" ||
        (i.lastError !== null && i.retryCount >= STUCK_AFTER_TRIES)
    )
    .map((i) => ({
      clientRef: i.clientRef,
      kind: i.kind,
      lastError: i.lastError,
      tries: i.retryCount,
    }));
}

/**
 * A sale whose shift will never arrive.
 *
 * Returns the item with its shift reference removed, or undefined when the
 * shift is still queued and the sale should simply wait its turn.
 */
async function shiftIsNotComing(
  item: OutboxItem,
  queue: OutboxItem[]
): Promise<OutboxItem | undefined> {
  if (item.kind !== "sale.completed") return undefined;

  const payload = item.payload as { shiftClientRef?: string } | null;
  const shiftRef = payload?.shiftClientRef;
  if (!shiftRef) return undefined;

  // Still ahead of us in the queue: wait, the order is doing its job.
  const stillQueued = queue.some(
    (q) =>
      q.clientRef === shiftRef &&
      q.kind === "shift.opened" &&
      q.state !== "failed"
  );
  if (stillQueued) return undefined;

  return {
    ...item,
    payload: { ...(payload ?? {}), shiftClientRef: undefined },
    state: "pending" satisfies OutboxItem["state"],
    retryCount: 0,
    nextAttemptAt: new Date().toISOString(),
    lastError: "shift never synced, sending the sale on its own",
  };
}
