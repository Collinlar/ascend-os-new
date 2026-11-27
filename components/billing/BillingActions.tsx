"use client";

// What a business does on Plans and billing (round 3, P4): dismiss a
// suggestion, ask Ascend for something or a top-up, cancel what it asked for.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { primaryAction, secondaryAction } from "@/components/shell/Page";

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const r = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timer);
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "We could not reach Ascend just now. Check your connection and tap again." } };
  }
}

export function DismissSuggestion({ suggestionKey, businessId }: { suggestionKey: string; businessId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await post({ action: "dismiss", businessId, key: suggestionKey });
          setBusy(false);
          if (!r.ok) return setError((r.data.error as string) ?? "That did not go through. Tap again.");
          router.refresh();
        }}
        className="tap flex min-h-[44px] items-center px-1 text-[13px] font-semibold text-neutral-600 hover:text-ink"
      >
        {busy ? "Hiding it" : "Not for me"}
      </button>
      {error && <span role="alert" className="text-[12px] text-danger-ink">{error}</span>}
    </span>
  );
}

export function AskForIt({ businessId, sku, label, topUp }: { businessId: string; sku?: string; label: string; topUp?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await post(sku ? { action: "request", businessId, sku } : { action: "request", businessId, topUp });
          setBusy(false);
          if (!r.ok) return setError((r.data.error as string) ?? "That did not go through. Tap again.");
          router.refresh();
        }}
        className={`${primaryAction} justify-center`}
      >
        {busy ? "Sending it to Ascend" : label}
      </button>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}

export function CancelOrder({ businessId, orderId }: { businessId: string; orderId: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!sure) {
    return (
      <button type="button" onClick={() => setSure(true)} className={`${secondaryAction} min-h-[40px] justify-center`}>
        I do not want it any more
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-neutral-700">Cancel this order? If you already paid, keep it and tell Ascend instead.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await post({ action: "cancel", businessId, orderId });
            setBusy(false);
            if (!r.ok) return setError((r.data.error as string) ?? "That did not go through. Tap again.");
            router.refresh();
          }}
          className={`${secondaryAction} min-h-[40px]`}
        >
          {busy ? "Cancelling" : "Yes, cancel the order"}
        </button>
        <button type="button" onClick={() => setSure(false)} className="tap min-h-[40px] px-2 text-[13px] font-semibold text-neutral-600">
          Keep it
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}

const AMOUNTS = [50, 100, 200, 500];

export function TopUpPicker({ businessId }: { businessId: string }) {
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const value = custom ? Number(custom) : amount;
  const bad = !Number.isFinite(value) || value < 20 || value > 20000;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="How much">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={!custom && amount === a}
            onClick={() => {
              setAmount(a);
              setCustom("");
            }}
            className={`tap min-h-[44px] rounded-full border-[1.5px] px-4 text-[14px] font-bold ${!custom && amount === a ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"}`}
          >
            GHS {a}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-semibold text-neutral-700">
        Or another amount, in GHS
        <input
          inputMode="decimal"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="How much do you want to add?"
          className="h-11 rounded-control border border-neutral-300 px-3 text-[16px] font-normal text-ink"
        />
      </label>
      {custom && bad && <p className="text-[13px] text-danger-ink">A top-up is between GHS 20 and GHS 20,000.</p>}
      {!bad && <AskForIt businessId={businessId} topUp={value} label={`Top up GHS ${value.toLocaleString("en-GB")}`} />}
    </div>
  );
}

export function PrintReceipt() {
  return (
    <button type="button" onClick={() => window.print()} className={`${secondaryAction} min-h-[44px] print:hidden`}>
      Print or save as PDF
    </button>
  );
}
