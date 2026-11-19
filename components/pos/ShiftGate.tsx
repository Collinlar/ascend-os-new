"use client";

import { useState } from "react";
import { openShift } from "@/lib/pos/shift";
import TillFrame, { tillInput, tillPrimary } from "@/components/pos/TillFrame";

// Sales belong to a shift (POS-SHF-001). The cashier declares the float
// they are starting with, so the count at the end means something.

export default function ShiftGate({
  onOpened,
  cashierMembershipId,
  tillLabel,
}: {
  onOpened: () => void;
  /** Recorded on the shift, so the business knows who was at the counter. */
  cashierMembershipId?: string;
  tillLabel?: string | null;
}) {
  const [openingCash, setOpeningCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const amount = openingCash.trim() === "" ? 0 : parseFloat(openingCash);
    if (Number.isNaN(amount) || amount < 0) {
      setError("Enter the cash you are starting with, or leave it empty for none.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openShift(amount, cashierMembershipId);
      onOpened();
    } catch {
      setError("Your shift did not open. Tap again.");
      setBusy(false);
    }
  }

  return (
    <TillFrame
      eyebrow={tillLabel}
      title="Start your shift"
      intro="Count the cash in the drawer before you sell. At close we compare it with what should be there."
    >
      <form onSubmit={start}>
        <label htmlFor="openingCash" className="mt-6 block text-[13.5px] font-semibold text-ink">
          Cash in the drawer now, in GH₵
        </label>
        <input
          id="openingCash"
          inputMode="decimal"
          autoFocus
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="0"
          className={`num ${tillInput}`}
        />
        {error && <p className="mt-3 text-[13.5px] font-semibold text-gold-700">{error}</p>}
        <button type="submit" disabled={busy} className={`mt-6 ${tillPrimary}`}>
          {busy ? "Opening your shift..." : "Open my shift"}
        </button>
      </form>
    </TillFrame>
  );
}
