"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// What the till does when this product runs out (Inventory Core I2,
// decision 4). Keep selling is the default and the safest for a busy
// counter; stop at zero only applies while the till is online.

type Rule = "none" | "soft" | "hard";

const RULES: [Rule, string, string][] = [
  ["none", "Keep selling", "The till never stops a sale over a stock figure."],
  ["soft", "Warn the cashier", "It sells, and tells the cashier the record says none are left."],
  ["hard", "Stop at zero", "It refuses while online. Offline it still sells, and you see it here."],
];

export default function StockRule({ businessId, itemId, rule }: { businessId: string; itemId: string; rule: Rule }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Rule>(rule);
  const [busy, setBusy] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Rule) {
    if (next === current || busy) return;
    setBusy(next);
    setError(null);
    try {
      const res = await fetch("/api/inventory/rule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, itemId, rule: next }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not save that just now. Tap again in a moment.");
        return;
      }
      setCurrent(next);
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <fieldset className="mb-4 rounded-[18px] border border-line-brand bg-white px-5 py-4">
      <legend className="sr-only">At the till, when it runs out</legend>
      <p className="text-[13.5px] font-semibold text-ink">At the till, when it runs out</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {RULES.map(([r, label]) => (
          <button
            key={r}
            type="button"
            aria-pressed={current === r}
            onClick={() => choose(r)}
            disabled={busy !== null}
            className={`tap min-h-[44px] rounded-chip px-3.5 text-[13.5px] font-semibold disabled:opacity-70 ${
              current === r ? "bg-teal text-white" : "border-[1.5px] border-line-brand bg-white text-ink"
            }`}
          >
            {busy === r ? "Saving..." : label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-neutral-600">{RULES.find(([r]) => r === current)?.[2]}</p>
      {error && <p role="alert" className="mt-2 text-[13px] text-danger-ink">{error}</p>}
    </fieldset>
  );
}
