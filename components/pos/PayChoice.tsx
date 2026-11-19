"use client";

// How the customer is paying, for both tills: cash, MoMo, card, or on
// credit. Cash keeps each layout's own keypad; the rest are the same panel.
//
// MoMo and card are recorded by the cashier with the reference on the
// customer's phone or the bank's slip. The sale says "recorded by you"
// until a provider confirms anything; QR and a MoMo prompt wait for
// Paystack, because without it they would only pretend to confirm.

import { useState } from "react";
import { formatGHS } from "@/lib/money";
import { MOMO_NETWORKS, type MomoNetwork, type TillPayment } from "@/lib/pos/sale";
import { sayPhone } from "@/lib/pos/customers";
import type { Till } from "@/lib/pos/useTill";

export type PayMethod = "cash" | "momo" | "card" | "credit";

const METHODS: { key: PayMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "momo", label: "MoMo" },
  { key: "card", label: "Card" },
  { key: "credit", label: "On credit" },
];

export function usePayChoice(till: Till) {
  const [method, setMethod] = useState<PayMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [network, setNetwork] = useState<MomoNetwork>("mtn_momo");
  const [momoRef, setMomoRef] = useState("");
  const [cardRef, setCardRef] = useState("");
  const total = till.total;
  const paid = parseFloat(tendered) || 0;

  const payment: TillPayment | null =
    method === "cash"
      ? paid >= total && total > 0
        ? { method: "cash", tendered: paid }
        : null
      : method === "momo"
        ? momoRef.trim().length >= 4
          ? { method: "momo", network, reference: momoRef }
          : null
        : method === "card"
          ? cardRef.trim().length >= 4
            ? { method: "card", reference: cardRef }
            : null
          : till.customer
            ? { method: "credit" }
            : null;

  const label = till.saving
    ? "Saving the sale on this till..."
    : payment
      ? method === "cash"
        ? `Take ${formatGHS(paid)} cash`
        : method === "momo"
          ? `Record ${formatGHS(total)} by MoMo`
          : method === "card"
            ? `Record ${formatGHS(total)} by card`
            : `Put ${formatGHS(total)} on ${till.customer?.name.split(" ")[0]}'s account`
      : method === "cash"
        ? "Enter what they gave you"
        : method === "credit"
          ? "Add who is paying later"
          : "Type the transaction ID";

  function reset() {
    setMethod("cash");
    setTendered("");
    setMomoRef("");
    setCardRef("");
  }

  return { method, setMethod, tendered, setTendered, paid, network, setNetwork, momoRef, setMomoRef, cardRef, setCardRef, payment, label, reset };
}

export type PayChoice = ReturnType<typeof usePayChoice>;

export function PayTabs({ choice, large }: { choice: PayChoice; large?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="How they are paying">
      {METHODS.map((m) => (
        <button
          key={m.key}
          role="tab"
          aria-selected={choice.method === m.key}
          onClick={() => choice.setMethod(m.key)}
          className={`tap rounded-control border-2 font-bold ${large ? "h-16 text-[15px]" : "h-12 text-[13px]"} ${
            choice.method === m.key ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** The MoMo, card and credit panels. Cash is the layout's own. */
export function OtherPayment({ choice, till, onAddCustomer }: { choice: PayChoice; till: Till; onAddCustomer: () => void }) {
  const input =
    "num h-12 w-full rounded-control border-[1.5px] border-line-brand px-3 text-[17px] font-bold tracking-[0.04em] text-ink placeholder:font-normal placeholder:tracking-normal placeholder:text-neutral-500 focus:border-teal focus:outline-none";

  if (choice.method === "momo") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-neutral-700">
          The customer sends {formatGHS(till.total)} to your MoMo number. When your phone shows it has arrived, type the transaction ID.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {MOMO_NETWORKS.map((n) => (
            <button
              key={n.key}
              onClick={() => choice.setNetwork(n.key)}
              aria-pressed={choice.network === n.key}
              className={`tap rounded-control border-[1.5px] text-[13px] font-bold ${
                choice.network === n.key ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 text-ink"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>
        <label htmlFor="momoRef" className="text-[13.5px] font-semibold text-ink">
          Transaction ID from the message
        </label>
        <input
          id="momoRef"
          autoFocus
          value={choice.momoRef}
          onChange={(e) => choice.setMomoRef(e.target.value)}
          placeholder="58723361904"
          className={`-mt-2 ${input}`}
        />
        <p className="text-[12.5px] text-neutral-600">Recorded by you. Ascend does not confirm MoMo payments yet.</p>
      </div>
    );
  }

  if (choice.method === "card") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-neutral-700">Take {formatGHS(till.total)} on the bank&apos;s card machine, then type the reference from its slip.</p>
        <label htmlFor="cardRef" className="text-[13.5px] font-semibold text-ink">
          Reference on the card slip
        </label>
        <input
          id="cardRef"
          autoFocus
          value={choice.cardRef}
          onChange={(e) => choice.setCardRef(e.target.value)}
          placeholder="Approval or RRN number"
          className={`-mt-2 ${input}`}
        />
        <p className="text-[12.5px] text-neutral-600">Recorded by you, as the slip says.</p>
      </div>
    );
  }

  // On credit: the customer takes the goods now and pays later. It is owed
  // to the business, not money in the drawer or the account (0118).
  return (
    <div className="flex flex-col gap-3">
      {till.customer ? (
        <div className="rounded-control border border-line-brand p-3.5">
          <p className="text-[14.5px] font-bold text-ink">{till.customer.name}</p>
          <p className="num text-[13px] text-neutral-600">{sayPhone(till.customer.phone)}</p>
          <p className="mt-2 text-[13.5px] text-neutral-700">
            Takes the goods now and owes {formatGHS(till.total)}. It shows as owed to you, not as money received.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[14px] text-neutral-700">A sale on credit needs to say who owes it.</p>
          <button
            onClick={onAddCustomer}
            className="tap flex h-12 items-center justify-center rounded-control border-[1.5px] border-teal text-[14px] font-bold text-teal-800"
          >
            Choose who is paying later
          </button>
        </>
      )}
    </div>
  );
}
