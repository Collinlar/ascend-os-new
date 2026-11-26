"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Toast, useToast } from "@/components/shell/Toast";

// Money taken on the day, against a shop order or a booking (Modules M6a,
// 0141): cash at pickup, MoMo sent to the merchant's number, a transfer.
// A receipt is made for it, and it stops counting as owed.

const field =
  "w-full min-h-[44px] rounded-control border-[1.5px] border-neutral-200 bg-white px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

const METHODS: Array<[string, string]> = [
  ["cash", "Cash"],
  ["mobile_money", "MoMo"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
];

export default function RecordPayment({
  source,
  sourceId,
  left,
  customerFirst,
  label = "Record what they paid",
}: {
  source: "shop_order" | "service_booking";
  sourceId: string;
  left: number;
  customerFirst: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(left.toFixed(2));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const [paidOn, setPaidOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per opening of the form, so a retried tap is the same payment.
  const key = useMemo(() => `${sourceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, [sourceId, open]);

  async function save() {
    const n = parseFloat(amount);
    if (!(n > 0)) return setError("Enter how much they paid, in GHS.");
    if (n > left + 0.005) return setError(`That is more than is left. ${formatGHS(left)} is still to pay.`);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, sourceId, amount: n, method, reference, paidOn, clientRef: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That did not go through. Tap again.");
        return;
      }
      const rest = Number(data.left ?? 0);
      toast.show(
        `${formatGHS(n)} recorded${data.receipt?.number ? `, receipt ${data.receipt.number} made` : ""}. ${rest > 0.005 ? `${formatGHS(rest)} still to pay.` : "Paid in full."}`
      );
      setOpen(false);
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${primaryAction} min-h-[40px] justify-center`}>
          {label}
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-panel border border-line-brand p-3">
          <span className="text-[13px] font-semibold text-ink">What {customerFirst} paid you</span>
          <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
            Amount, GHS
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <div role="radiogroup" aria-label="How they paid" className="grid grid-cols-2 gap-1.5">
            {METHODS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={method === k}
                onClick={() => setMethod(k)}
                className={`tap flex min-h-[40px] items-center justify-center rounded-[10px] border-[1.5px] text-[13px] font-semibold ${
                  method === k ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {method !== "cash" && (
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "mobile_money" ? "MoMo transaction ID, if you have it" : "Reference, if you have it"}
              aria-label="Reference"
              className={field}
            />
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
            Paid on
            <input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className={field} />
          </label>
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}>
              {busy ? "Recording it..." : `Record ${parseFloat(amount) > 0 ? formatGHS(parseFloat(amount)) : "it"}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={secondaryAction}>
              Not now
            </button>
          </div>
          <span className="text-xs leading-relaxed text-neutral-600">For money that reached you on the day. A receipt is made and it stops counting as owed.</span>
        </div>
      )}
      <Toast message={toast.message} />
    </div>
  );
}
