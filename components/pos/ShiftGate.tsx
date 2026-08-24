"use client";

import { useState } from "react";
import { openShift } from "@/lib/pos/shift";

// Sales belong to a shift (POS-SHF-001). The cashier declares the float
// they are starting with, so the count at the end means something.

export default function ShiftGate({
  onOpened,
  cashierMembershipId,
}: {
  onOpened: () => void;
  /** Recorded on the shift, so the business knows who was at the counter. */
  cashierMembershipId?: string;
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
      setError("We could not open your shift. Tap again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
      <form onSubmit={start} className="w-full max-w-sm">
        <p className="text-sm font-medium text-teal-light">Ascend POS</p>
        <h1 className="mt-4 text-2xl font-semibold leading-display">
          Start your shift.
        </h1>
        <p className="mt-3 text-white/70">
          Count the cash in the drawer before you sell. At close we compare it
          with what should be there.
        </p>

        <label htmlFor="openingCash" className="mt-8 block text-sm text-white/70">
          Cash in the drawer now
        </label>
        <input
          id="openingCash"
          inputMode="decimal"
          autoFocus
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="0"
          className="mt-2 w-full bg-white/10 px-4 py-3 text-2xl font-semibold text-white placeholder:text-base placeholder:font-normal placeholder:text-white/40 focus:outline-none"
        />

        {error && <p className="mt-3 text-sm text-gold">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="tap mt-6 w-full bg-teal py-3.5 text-lg font-semibold disabled:opacity-40"
        >
          {busy ? "Opening..." : "Open my shift"}
        </button>
      </form>
    </main>
  );
}
