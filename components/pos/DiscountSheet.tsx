"use client";

// Taking something off a sale. An owner or manager at the till gives it
// straight away; a cashier asks, and a manager standing by types their own
// PIN on this till to allow it (works offline: PINs and roles are on the
// device). The sale records who allowed it (0122).

import { useState } from "react";
import { formatGHS } from "@/lib/money";
import { cents } from "@/lib/pos/sale";
import { approveWithPin, canApprove } from "@/lib/pos/staff";
import { KEYPAD } from "@/lib/pos/cash";
import TillSheet from "@/components/pos/TillSheet";
import type { Till } from "@/lib/pos/useTill";

const PERCENTS = [5, 10, 15, 20];

export default function DiscountSheet({ till, onClose }: { till: Till; onClose: () => void }) {
  const { subtotal, cashier, discount } = till;
  const [percent, setPercent] = useState<number | null>(discount?.percent ?? null);
  const [amountText, setAmountText] = useState(discount && !discount.percent ? String(discount.amount) : "");
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const amount = percent ? cents((subtotal * percent) / 100) : cents(Math.min(parseFloat(amountText) || 0, subtotal));
  const label = percent ? `${percent}%` : formatGHS(amount);
  const valid = amount > 0 && amount <= subtotal;
  const mayGive = canApprove(cashier);

  function apply(approver: { membershipId: string; displayName: string }) {
    till.setDiscount({
      percent: percent ?? undefined,
      amount,
      label,
      approvedBy: approver.membershipId,
      approvedByName: approver.displayName,
    });
    onClose();
  }

  async function pressPin(k: string) {
    if (k === "back") return setPin((p) => p.slice(0, -1));
    if (k === ".") return;
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    const result = await approveWithPin(next);
    setPin("");
    if (result.ok) return apply(result.approver);
    if (result.reason === "locked") {
      setNote(`Too many tries. Wait ${Math.ceil((result.waitMs ?? 60000) / 1000)} seconds.`);
    } else if (result.reason === "not_allowed") {
      setNote("That PIN cannot allow discounts. Ask the owner or a manager.");
    } else {
      setNote(`That PIN is not right. ${result.triesLeft ?? 0} tries left.`);
    }
  }

  return (
    <TillSheet title={asking ? "A manager allows this" : "Take something off"} onClose={onClose}>
      {asking ? (
        <div className="flex flex-col items-center gap-4 p-5">
          <p className="text-center text-[14.5px] text-neutral-700">
            {label} off, {formatGHS(amount)}. The owner or a manager types their PIN to allow it.
          </p>
          <span className="flex gap-3" aria-label={`${pin.length} of 4 digits entered`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 border-teal ${i < pin.length ? "bg-teal" : ""}`} />
            ))}
          </span>
          {note && <p className="text-center text-[13.5px] font-semibold text-gold-700">{note}</p>}
          <div className="grid w-full max-w-xs grid-cols-3 gap-2">
            {KEYPAD.map((k) =>
              k === "." ? (
                <span key={k} />
              ) : (
                <button
                  key={k}
                  onClick={() => pressPin(k)}
                  aria-label={k === "back" ? "Delete the last digit" : k}
                  className="tap flex h-14 items-center justify-center rounded-control bg-neutral-50 font-heading text-[20px] font-bold text-ink active:bg-teal-50"
                >
                  {k === "back" ? "←" : k}
                </button>
              )
            )}
          </div>
          <button onClick={() => setAsking(false)} className="tap flex items-center px-3 text-[13.5px] font-semibold text-neutral-600">
            Change the discount
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 p-4">
          <div className="grid grid-cols-4 gap-2">
            {PERCENTS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPercent(p);
                  setAmountText("");
                }}
                aria-pressed={percent === p}
                className={`tap rounded-control border-[1.5px] text-[15px] font-bold ${
                  percent === p ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 text-ink"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <label htmlFor="discountAmount" className="text-[13.5px] font-semibold text-ink">
            Or an amount, in GH₵
          </label>
          <input
            id="discountAmount"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              setPercent(null);
            }}
            placeholder="5.00"
            className="num -mt-2 h-12 rounded-control border-[1.5px] border-line-brand px-3 text-[18px] font-bold text-ink placeholder:font-normal placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
          {parseFloat(amountText) > subtotal && (
            <p className="text-[13px] font-semibold text-gold-700">That is more than the sale. The most you can take off is {formatGHS(subtotal)}.</p>
          )}
          <div className="flex items-baseline justify-between rounded-control bg-neutral-50 px-3.5 py-3">
            <span className="text-[13.5px] text-neutral-600">They pay</span>
            <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{formatGHS(cents(subtotal - (valid ? amount : 0)))}</span>
          </div>
          {discount && (
            <button
              onClick={() => {
                till.setDiscount(null);
                onClose();
              }}
              className="tap flex items-center justify-center rounded-control text-[13.5px] font-semibold text-danger-ink"
            >
              Take the discount off
            </button>
          )}
          <button
            disabled={!valid}
            onClick={() => (mayGive && cashier ? apply(cashier) : setAsking(true))}
            className="tap num flex h-[52px] items-center justify-center rounded-[14px] bg-teal font-heading text-[16px] font-extrabold text-white disabled:opacity-40"
          >
            {!valid ? "Pick how much to take off" : mayGive ? `Take ${formatGHS(amount)} off` : `Ask a manager to allow ${formatGHS(amount)} off`}
          </button>
        </div>
      )}
    </TillSheet>
  );
}
