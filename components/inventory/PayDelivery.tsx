"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

// Pay for a delivery that came on credit (Advanced Inventory A2). Records
// the money out once, under Stock and goods for resale.

type Method = "cash" | "mobile_money" | "bank_transfer" | "card";
const METHODS: [Method, string][] = [
  ["cash", "Cash"],
  ["mobile_money", "MoMo"],
  ["bank_transfer", "Bank"],
  ["card", "Card"],
];

export default function PayDelivery({ businessId, receiptId, amount }: { businessId: string; receiptId: string; amount: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!method) return setError("Say how you paid: cash, MoMo, bank or card.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/receipt/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, receiptId, paymentMethod: method }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not record that payment just now. Tap again in a moment.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    `tap min-h-[44px] rounded-chip px-3.5 text-[13.5px] font-semibold ${on ? "bg-teal text-white" : "border-[1.5px] border-line-brand bg-white text-ink"}`;

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="tap min-h-[44px] flex-none rounded-control px-3 text-[13.5px] font-semibold text-teal-800 hover:bg-teal-50">
        I have paid this
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 pt-1">
      <p className="text-[12.5px] font-semibold text-neutral-700">How did you pay?</p>
      <div className="flex flex-wrap gap-2">
        {METHODS.map(([m, label]) => (
          <button key={m} type="button" aria-pressed={method === m} onClick={() => { setMethod(m); setError(null); }} className={chip(method === m)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={pay} disabled={busy} className="tap min-h-[44px] rounded-control bg-teal px-3.5 text-[13.5px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
          {busy ? "Recording it..." : `Record ${formatGHS(amount)} paid`}
        </button>
        <button type="button" onClick={() => { setAsking(false); setMethod(null); }} className="tap min-h-[44px] rounded-control border border-line-brand px-3.5 text-[13.5px] font-semibold text-ink">
          Not yet
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
