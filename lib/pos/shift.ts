// Terminal-side shift state (POS PRD §20). Opening a shift, tracking money
// paid out of the drawer, and closing with a cash count all work with no
// network (POS-SHF-007); the server reconciles when the queue drains.

import { newClientRef } from "@/lib/ids";
import {
  get,
  getAll,
  put,
  STORE,
  type LocalSale,
  type OutboxItem,
} from "./db";

const ACTIVE_KEY = "active";

export interface TillExpense {
  clientRef: string;
  amount: number;
  reason: string;
  occurredAt: string;
}

export interface LocalShift {
  id: typeof ACTIVE_KEY; // one active shift per device (POS-SHF-010)
  clientRef: string;
  openingCash: number;
  openedAt: string;
  expenses: TillExpense[];
  closed: boolean;
}

export async function getActiveShift(): Promise<LocalShift | undefined> {
  const shift = await get<LocalShift>(STORE.shift, ACTIVE_KEY);
  return shift && !shift.closed ? shift : undefined;
}

// The cashier is part of the shift, not decoration on it. pos_shift requires
// one, so a shift opened without it never reaches the server at all: the
// till keeps selling, the queue keeps a permanently rejected item, and the
// business loses the record of who was at the counter between which hours.
export async function openShift(
  openingCash: number,
  cashierMembershipId?: string
): Promise<LocalShift> {
  const existing = await getActiveShift();
  if (existing) return existing;

  const now = new Date().toISOString();
  const shift: LocalShift = {
    id: ACTIVE_KEY,
    clientRef: newClientRef("shift"),
    openingCash,
    openedAt: now,
    expenses: [],
    closed: false,
  };

  const outboxItem: OutboxItem = {
    clientRef: shift.clientRef,
    kind: "shift.opened",
    payload: {
      clientRef: shift.clientRef,
      openingCash,
      cashierMembershipId,
      openedAt: now,
    },
    state: "pending",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    lastError: null,
  };

  await put(STORE.shift, shift);
  await put(STORE.outbox, outboxItem);
  return shift;
}

export async function addTillExpense(
  amount: number,
  reason: string
): Promise<LocalShift | undefined> {
  const shift = await getActiveShift();
  if (!shift) return undefined;

  const updated: LocalShift = {
    ...shift,
    expenses: [
      ...shift.expenses,
      {
        clientRef: newClientRef("exp"),
        amount,
        reason,
        occurredAt: new Date().toISOString(),
      },
    ],
  };
  await put(STORE.shift, updated);
  return updated;
}

export interface ShiftTotals {
  openingCash: number;
  cashSales: number;
  expenses: number;
  expectedCash: number;
  saleCount: number;
}

// What the drawer should hold right now, computed from this device's own
// records so the count works with no network.
export async function shiftTotals(shift: LocalShift): Promise<ShiftTotals> {
  const sales = await getAll<LocalSale>(STORE.sales);
  const mine = sales.filter((s) => s.shiftId === shift.clientRef);

  const cashSales = mine.reduce(
    (sum, sale) =>
      sum +
      sale.payments
        .filter((p) => p.method === "cash")
        .reduce((n, p) => n + p.amount, 0),
    0
  );
  const expenses = shift.expenses.reduce((n, e) => n + e.amount, 0);

  return {
    openingCash: shift.openingCash,
    cashSales: round2(cashSales),
    expenses: round2(expenses),
    expectedCash: round2(shift.openingCash + cashSales - expenses),
    saleCount: mine.length,
  };
}

export interface CloseResult {
  expected: number;
  declared: number;
  difference: number;
}

// Closes locally and queues the close. The server recomputes expected cash
// from its own records; the device's figure travels alongside so a
// disagreement is visible rather than silently overwritten.
export async function closeShift(
  declaredCash: number,
  cashierMembershipId?: string,
  differenceNote?: string
): Promise<CloseResult | undefined> {
  const shift = await getActiveShift();
  if (!shift) return undefined;

  const totals = await shiftTotals(shift);
  const now = new Date().toISOString();
  const difference = round2(declaredCash - totals.expectedCash);
  const closeRef = newClientRef("close");

  const outboxItem: OutboxItem = {
    clientRef: closeRef,
    kind: "shift.closed",
    payload: {
      clientRef: closeRef,
      shiftClientRef: shift.clientRef,
      cashierMembershipId,
      declaredCash,
      deviceExpectedCash: totals.expectedCash,
      differenceNote: differenceNote ?? null,
      expenses: shift.expenses,
      closedAt: now,
    },
    state: "pending",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    lastError: null,
  };

  await put(STORE.shift, { ...shift, closed: true });
  await put(STORE.outbox, outboxItem);

  return { expected: totals.expectedCash, declared: declaredCash, difference };
}

// A difference beyond this needs an explanation before the shift can close
// (POS-SHF-005). Small change rounding is normal; a large gap is not.
export const DIFFERENCE_THRESHOLD = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
