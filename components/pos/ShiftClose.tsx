"use client";

import { useEffect, useState } from "react";
import TillFrame, { tillInput, tillPrimary, tillSecondary } from "@/components/pos/TillFrame";
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
      setError("Your shift did not close. Tap again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done" && result) {
    return (
      <TillFrame title="Shift closed" intro={`Expected ${formatGHS(result.expected)} in the drawer.`}>
        <p
          className={`mt-5 rounded-control px-4 py-3 font-heading text-[18px] font-bold ${
            result.difference === 0 ? "bg-success-tint text-success-ink" : "bg-gold-100 text-gold-700"
          }`}
        >
          {result.difference === 0
            ? "It balanced exactly."
            : result.difference > 0
              ? `${formatGHS(result.difference)} more than expected.`
              : `${formatGHS(Math.abs(result.difference))} short.`}
        </p>
        <p className="mt-3 text-[13.5px] text-neutral-600">The owner gets this summary once the till reaches network.</p>
        <button onClick={onClosed} className={`mt-6 ${tillPrimary}`}>
          Hand the till to the next person
        </button>
      </TillFrame>
    );
  }

  return (
    <TillFrame title="Close your shift">
      {totals && (
        <dl className="mt-5 space-y-2 rounded-card border border-line-brand p-4 text-[14px]">
          <Row label="Cash you started with" value={formatGHS(totals.openingCash)} />
          <Row label={`Cash sales (${totals.saleCount})`} value={formatGHS(totals.cashSales)} />
          {totals.expenses > 0 && <Row label="Money taken out" value={`− ${formatGHS(totals.expenses)}`} />}
          {totals.refundsPaid > 0 && <Row label="Refunds handed back" value={`− ${formatGHS(totals.refundsPaid)}`} />}
          <div className="border-t border-neutral-100 pt-2">
            <Row label="Should be in the drawer" value={formatGHS(totals.expectedCash)} strong />
          </div>
        </dl>
      )}

      {/* Money paid out of the till, so the count is not wrongly short */}
      {showExpense ? (
        <div className="mt-4 space-y-2 rounded-card border border-line-brand p-4">
          <label htmlFor="expenseAmount" className="block text-[13.5px] font-semibold text-ink">
            How much left the drawer
          </label>
          <input
            id="expenseAmount"
            inputMode="decimal"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            placeholder="0"
            className="num mt-1 h-12 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 font-heading text-[18px] font-bold text-ink-heading placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
          <label htmlFor="expenseReason" className="block pt-1 text-[13.5px] font-semibold text-ink">
            What was it for?
          </label>
          <input
            id="expenseReason"
            value={expenseReason}
            onChange={(e) => setExpenseReason(e.target.value)}
            placeholder="Bread for the staff, transport, change from the bank"
            className="mt-1 h-12 w-full rounded-control border-[1.5px] border-line-brand px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowExpense(false)} className={tillSecondary}>
              Leave it
            </button>
            <button onClick={saveExpense} className={tillPrimary}>
              Take it off the count
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowExpense(true)} className={`mt-3 ${tillSecondary}`}>
          Money left the drawer today
        </button>
      )}

      <label htmlFor="declared" className="mt-6 block text-[13.5px] font-semibold text-ink">
        Count the drawer and enter what is there
      </label>
      <input
        id="declared"
        inputMode="decimal"
        value={declared}
        onChange={(e) => setDeclared(e.target.value)}
        placeholder="Actual cash counted"
        className={`num ${tillInput}`}
      />

      {difference !== null && (
        <p className={`mt-3 text-[16px] font-bold ${difference === 0 ? "text-success-ink" : "text-gold-700"}`}>
          {difference === 0
            ? "It balances exactly."
            : difference > 0
              ? `${formatGHS(difference)} more than expected.`
              : `${formatGHS(Math.abs(difference))} short.`}
        </p>
      )}

      {needsNote && (
        <div className="mt-4">
          <label htmlFor="note" className="block text-[13.5px] font-semibold text-ink">
            What happened?
          </label>
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain the difference for the owner"
            className="mt-2 w-full rounded-control border-[1.5px] border-line-brand px-3 py-2.5 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
        </div>
      )}

      {error && <p className="mt-3 text-[13.5px] font-semibold text-gold-700">{error}</p>}

      <div className="mt-6 flex gap-2">
        <button onClick={onCancel} className={`${tillSecondary} flex-1`}>
          Keep selling
        </button>
        <button
          onClick={finish}
          disabled={busy || declared.trim() === ""}
          className="tap flex h-14 flex-[2] items-center justify-center rounded-[14px] bg-navy font-heading text-[17px] font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Closing your shift..." : "Close my shift"}
        </button>
      </div>
    </TillFrame>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold text-ink" : "text-neutral-600"}>{label}</dt>
      <dd className={`num ${strong ? "font-heading text-[18px] font-extrabold text-ink-heading" : "font-semibold text-ink"}`}>{value}</dd>
    </div>
  );
}
