// Goods on the way to this till's place (Advanced Inventory A1, 0131).
//
// The catalogue pull brings the list: where it comes from and the products,
// never how many were sent, so the cashier counts what is in the box. A
// count goes out through the outbox like a sale, so it is safe with no
// network and arrives when the till is back online. Once counted here, a
// transfer leaves the list on this till at once, before the server hears.

import { newClientRef } from "@/lib/ids";
import { getMeta, put, setMeta, STORE, type OutboxItem } from "@/lib/pos/db";

export interface IncomingTransfer {
  id: string;
  from: string;
  sentAt: string;
  note: string | null;
  lines: { itemId: string; item: string }[];
}

const LIST_KEY = "incoming";
const DONE_KEY = "incomingCounted";

/** What is still to be counted in at this counter. */
export async function openIncoming(): Promise<IncomingTransfer[]> {
  const done = new Set((await getMeta<string[]>(DONE_KEY)) ?? []);
  return ((await getMeta<IncomingTransfer[]>(LIST_KEY)) ?? []).filter((t) => !done.has(t.id));
}

export type CountInResult = { ok: true } | { ok: false; error: string };

export async function countIn(
  transfer: IncomingTransfer,
  received: Record<string, string>,
  note: string,
  cashierMembershipId?: string
): Promise<CountInResult> {
  if (!cashierMembershipId) return { ok: false, error: "Sign in with your PIN first, so Ascend knows who counted it." };
  const lines: { itemId: string; received: number }[] = [];
  for (const l of transfer.lines) {
    const v = (received[l.itemId] ?? "").trim();
    if (v === "") return { ok: false, error: `Say how many ${l.item} arrived. Zero is fine if none came.` };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `That number for ${l.item} is not one we can use.` };
    lines.push({ itemId: l.itemId, received: n });
  }
  const now = new Date().toISOString();
  const clientRef = newClientRef("transfer");
  const item: OutboxItem = {
    clientRef,
    kind: "transfer.received",
    payload: { clientRef, transferId: transfer.id, lines, note: note.trim(), cashierMembershipId },
    state: "pending",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    lastError: null,
  };
  // The count first: if the app dies between the two, the office still gets
  // it, and the till only shows the notice once more.
  await put(STORE.outbox, item);
  const done = (await getMeta<string[]>(DONE_KEY)) ?? [];
  if (!done.includes(transfer.id)) await setMeta(DONE_KEY, [...done, transfer.id].slice(-100));
  return { ok: true };
}
