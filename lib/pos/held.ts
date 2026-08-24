// Held sales (POS-016). A customer goes back for something they forgot, or
// steps away to find money, and the queue behind them should not wait. The
// cashier parks the basket and serves the next person.
//
// Held baskets live in the local store, so they survive an app restart or a
// dead battery mid-shift (POS-OFF-008). They do not touch stock: nothing has
// been sold yet, and reserving against a basket that may never complete
// would make the shelf count lie (POS §14.2).

import { get, put, remove, getAll, STORE, type LocalItem } from "./db";

export interface HeldLine {
  item: LocalItem;
  quantity: number;
}

export interface HeldSale {
  id: string;
  label: string; // "Sale A", "Sale B" — what the cashier calls out
  reference: string;
  lines: HeldLine[];
  total: number;
  itemCount: number;
  customerName?: string;
  heldAt: string;
}

const SEQ_KEY = "holdSeq";

// Letters are easier to say across a counter than numbers, and they do not
// collide with receipt numbers in conversation.
function labelFor(seq: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (seq <= 26) return `Sale ${letters[seq - 1]}`;
  return `Sale ${seq}`;
}

export async function holdSale(
  lines: HeldLine[],
  customerName?: string
): Promise<HeldSale | undefined> {
  if (lines.length === 0) return undefined;

  const meta = await get<{ key: string; value: number }>(STORE.meta, SEQ_KEY);
  const seq = (meta?.value ?? 0) + 1;

  const held: HeldSale = {
    id: `held-${seq}-${Date.now()}`,
    label: labelFor(seq),
    reference: `HOLD-${String(seq).padStart(3, "0")}`,
    lines,
    total: lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0),
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    customerName,
    heldAt: new Date().toISOString(),
  };

  await put(STORE.shift, { id: held.id, held });
  await put(STORE.meta, { key: SEQ_KEY, value: seq });
  return held;
}

// Held baskets share the shift store, keyed apart from the active shift.
export async function listHeld(): Promise<HeldSale[]> {
  const rows = await getAll<{ id: string; held?: HeldSale }>(STORE.shift);
  return rows
    .filter((r) => r.held !== undefined)
    .map((r) => r.held as HeldSale)
    .sort((a, b) => b.heldAt.localeCompare(a.heldAt));
}

export async function resumeHeld(id: string): Promise<HeldSale | undefined> {
  const row = await get<{ id: string; held?: HeldSale }>(STORE.shift, id);
  if (!row?.held) return undefined;
  await remove(STORE.shift, id);
  return row.held;
}

export async function discardHeld(id: string): Promise<void> {
  await remove(STORE.shift, id);
}

// How long a basket has been parked. A basket held since this morning is
// usually abandoned, and the cashier should be told rather than left to
// guess.
export function heldFor(heldAt: string): string {
  const minutes = Math.round((Date.now() - new Date(heldAt).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.round(hours / 24)} days ago`;
}
