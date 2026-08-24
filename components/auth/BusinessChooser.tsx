"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Picking which business to open.
//
// Used at sign in when a number holds more than one, and again from the nav
// when somebody wants to put one down and open the other. Both are the same
// question, so they are the same control.

export interface ChoosableBusiness {
  id: string;
  name: string;
  /** The one currently open, if any. */
  current?: boolean;
}

export default function BusinessChooser({
  businesses,
  onOpened,
}: {
  businesses: ChoosableBusiness[];
  /** Where to land. Defaults to the business home. */
  onOpened?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(businessId: string) {
    setBusy(businessId);
    setError(null);
    try {
      const res = await fetch("/api/auth/current-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "We could not open that one. Tap again.");
        setBusy(null);
        return;
      }
      router.push(onOpened ?? "/dashboard");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="space-y-3">
        {businesses.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={busy !== null}
            onClick={() => open(b.id)}
            className={`tap flex w-full items-center justify-between rounded-panel border px-5 text-left font-bold disabled:opacity-50 ${
              b.current
                ? "border-teal bg-teal-light text-teal-dark"
                : "border-line bg-surface text-ink"
            }`}
          >
            <span>{b.name}</span>
            <span className="text-sm font-bold text-teal-dark">
              {busy === b.id ? "Opening..." : b.current ? "Open now" : "Open"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
