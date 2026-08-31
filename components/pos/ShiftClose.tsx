"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
import { useEffect, useState } from "react";
import { formatGHS } from "@/lib/money";
import {
  addTillExpense,
  closeShift,
  DIFFERENCE_THRESHOLD,
  shiftTotals,
  type LocalShift,
  type ShiftTotals,
} from "@/lib/pos/shift";

// Day close (POS PRD §20.3): show what should be in the drawer, take the
// cashier's count, and make them explain a real gap before it closes
// (POS-SHF-003..005). Works with no network.

type Step = "count" | "done";

export default function ShiftClose({
  shift,
  onClosed,
  onCancel,
  cashierMembershipId,
}: {
  shift: LocalShift;
  onClosed: () => void;
  onCancel: () => void;
  /** Who closed and counted, recorded alongside who opened. */
  cashierMembershipId?: string;
}) {
  const [totals, setTotals] = useState<ShiftTotals | null>(null);
  const [declared, setDeclared] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("count");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ difference: number; expected: number } | null>(null);

  // Adding money paid out of the till
  const [showExpense, setShowExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReason, setExpenseReason] = useState("");
  const [current, setCurrent] = useState<LocalShift>(shift);

  useEffect(() => {
    shiftTotals(current).then(setTotals).catch(() => {});
  }, [current]);

  const declaredNum = parseFloat(declared);
  const difference =
    totals && !Number.isNaN(declaredNum)
      ? Math.round((declaredNum - totals.expectedCash) * 100) / 100
      : null;
  const needsNote =
    difference !== null && Math.abs(difference) > DIFFERENCE_THRESHOLD;

  async function saveExpense() {
    const amount = parseFloat(expenseAmount);
    if (!(amount > 0) || expenseReason.trim().length < 2) {
      setError("Enter how much left the drawer and what it was for.");
      return;
    }
    const updated = await addTillExpense(amount, expenseReason.trim());
    if (updated) setCurrent(updated);
    setExpenseAmount("");
    setExpenseReason("");
    setShowExpense(false);
    setError(null);
  }

  async function finish() {
    if (Number.isNaN(declaredNum)) {
      setError("Count the cash in the drawer and enter the amount.");
      return;
    }
    if (needsNote && note.trim().length < 3) {
      setError("The count does not match. Say what happened before closing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const closed = await closeShift(declaredNum, cashierMembershipId, note.trim() || undefined);
      if (!closed) {
        setError("This shift is already closed.");
        return;
      }
      setResult({ difference: closed.difference, expected: closed.expected });
      setStep("done");
    } catch {
      setError("We could not close your shift. Tap again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done" && result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold">Shift closed.</h1>
          <p className="mt-3 text-white/70">
            Expected {formatGHS(result.expected)} in the drawer.
          </p>
          <p className="mt-1 text-lg font-semibold">
            {result.difference === 0
              ? "It balanced exactly."
              : result.difference > 0
                ? `${formatGHS(result.difference)} more than expected.`
                : `${formatGHS(Math.abs(result.difference))} short.`}
          </p>
          <p className="mt-4 text-sm text-white/50">
            The owner gets this summary once the till reaches network.
          </p>
          <button
            onClick={onClosed}
            className="tap mt-6 w-full bg-teal py-3.5 font-semibold"
          >
            Done
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-semibold leading-display">Close your shift.</h1>

        {totals && (
          <dl className="mt-6 space-y-2 border border-white/15 p-4 text-sm">
            <Row label="Cash you started with" value={formatGHS(totals.openingCash)} />
            <Row
              label={`Cash sales (${totals.saleCount})`}
              value={formatGHS(totals.cashSales)}
            />
            {totals.expenses > 0 && (
              <Row label="Money taken out" value={`− ${formatGHS(totals.expenses)}`} />
            )}
            <div className="border-t border-white/15 pt-2">
              <Row
                label="Should be in the drawer"
                value={formatGHS(totals.expectedCash)}
                strong
              />
            </div>
          </dl>
        )}

        {/* Money paid out of the till, so the count is not wrongly short */}
        {showExpense ? (
          <div className="mt-4 space-y-2 border border-white/15 p-4">
            <input
              inputMode="decimal"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="How much left the drawer"
              className="w-full bg-white/10 px-3 py-2.5 text-white placeholder:text-white/60 focus:outline-none"
            />
            <input
              value={expenseReason}
              onChange={(e) => setExpenseReason(e.target.value)}
              placeholder="What was it for?"
              className="w-full bg-white/10 px-3 py-2.5 text-white placeholder:text-white/60 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowExpense(false)}
                className="tap flex-1 border border-white/30 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveExpense}
                className="tap flex-1 bg-white/15 py-2.5 text-sm font-medium"
              >
                Add it
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowExpense(true)}
            className="tap mt-3 w-full border border-white/30 py-2.5 text-sm font-medium"
          >
            Money left the drawer today
          </button>
        )}

        <label htmlFor="declared" className="mt-6 block text-sm text-white/70">
          Count the drawer and enter what is there
        </label>
        <input
          id="declared"
          inputMode="decimal"
          value={declared}
          onChange={(e) => setDeclared(e.target.value)}
          placeholder="Actual cash counted"
          className="mt-2 w-full bg-white/10 px-4 py-3 text-2xl font-semibold text-white placeholder:text-base placeholder:font-normal placeholder:text-white/60 focus:outline-none"
        />

        {difference !== null && (
          <p className="mt-3 text-lg">
            {difference === 0 ? (
              <span className="text-teal-light">It balances exactly.</span>
            ) : difference > 0 ? (
              <span className="text-gold">
                {formatGHS(difference)} more than expected.
              </span>
            ) : (
              <span className="text-gold">
                {formatGHS(Math.abs(difference))} short.
              </span>
            )}
          </p>
        )}

        {needsNote && (
          <div className="mt-4">
            <label htmlFor="note" className="block text-sm text-white/70">
              What happened?
            </label>
            <textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the difference for the owner"
              className="mt-2 w-full bg-white/10 px-3 py-2.5 text-white placeholder:text-white/60 focus:outline-none"
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-gold">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            onClick={onCancel}
            className="tap flex-1 border border-white/30 py-3.5 font-medium"
          >
            Keep selling
          </button>
          <button
            onClick={finish}
            disabled={busy || declared.trim() === ""}
            className="tap flex-[2] bg-teal py-3.5 text-lg font-semibold disabled:opacity-40"
          >
            {busy ? "Closing..." : "Close my shift"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-medium" : "text-white/70"}>{label}</dt>
      <dd className={strong ? "text-lg font-semibold" : ""}>{value}</dd>
    </div>
  );
}
