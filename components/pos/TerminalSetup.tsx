"use client";

import { useEffect, useState } from "react";
import { pairTerminal, pullCatalogue } from "@/lib/pos/registration";
import TillFrame, { tillInput, tillPrimary } from "@/components/pos/TillFrame";

// One-time setup on a new till (IDN-006). Needs network once; after this
// the terminal sells offline until its lease runs out.

export default function TerminalSetup({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState("");

  // A till reached by link or QR arrives with its code already attached, so
  // nobody types a pairing code on a terminal keyboard while a queue waits.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("code");
    if (fromLink) setCode(fromLink.toUpperCase());
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = code.replace(/[^a-zA-Z0-9]/g, "");

  // Codes are drawn from an alphabet with the ambiguous characters left
  // out, so 0, 1, I and O never appear in a real one. Someone typing them
  // is reading a different code, usually their own staff PIN, and saying so
  // beats letting them retype the same wrong thing.
  const impossible = clean.match(/[01IO]/g);

  // A disabled button with no reason is the cashier's problem to solve
  // blind. Say what is missing while they type.
  const hint = (() => {
    if (clean.length === 0) return null;
    if (impossible) {
      const shown = Array.from(new Set(impossible)).join(" and ");
      return `A pairing code never has ${shown} in it. Look at the code on the dashboard again.`;
    }
    if (/^\d+$/.test(clean) && clean.length <= 6) {
      return "That looks like a staff PIN. A pairing code has letters in it and comes from the dashboard.";
    }
    if (clean.length < 6) {
      const left = 6 - clean.length;
      return `${left} more character${left === 1 ? "" : "s"} to go.`;
    }
    if (clean.length > 6) return "That is longer than 6 characters. Look at the code again.";
    return null;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await pairTerminal(code);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    await pullCatalogue();
    setBusy(false);
    onPaired();
  }

  return (
    <TillFrame
      title="Set up this till"
      intro={
        <>
          <p>On the Ascend dashboard, open Devices and tap Set up a new till. Type the code it shows here. You only do this once.</p>
          <p className="mt-1.5 text-[13.5px] text-neutral-500">This is not a staff PIN. Those come once the till is set up.</p>
        </>
      }
    >
      <form onSubmit={submit}>
        <label htmlFor="code" className="mt-6 block text-[13.5px] font-semibold text-ink">
          Pairing code
        </label>
        <input
          id="code"
          value={code}
          autoFocus
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC-234"
          className={`${tillInput} tracking-[0.18em] placeholder:tracking-normal`}
        />
        {error ? (
          <p className="mt-3 text-[13.5px] font-semibold text-gold-700">{error}</p>
        ) : (
          hint && <p className="mt-3 text-[13.5px] text-neutral-600">{hint}</p>
        )}
        <button type="submit" disabled={busy || clean.length !== 6} className={`mt-6 ${tillPrimary}`}>
          {busy ? "Setting up your till..." : "Set up this till"}
        </button>
        <p className="mt-3 text-center text-[13px] text-neutral-500">This step needs network. Selling does not.</p>
      </form>
    </TillFrame>
  );
}
