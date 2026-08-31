"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
import { useEffect, useState } from "react";
import { pairTerminal, pullCatalogue } from "@/lib/pos/registration";

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
  // blind. Say what is missing while they type (SEC-UX, code quality
  // standards on real-time validation).
  const hint = (() => {
    if (clean.length === 0) return null;
    if (impossible) {
      const shown = Array.from(new Set(impossible)).join(" and ");
      return `A pairing code never has ${shown} in it. Check the code on the dashboard.`;
    }
    if (/^\d+$/.test(clean) && clean.length <= 6) {
      return "That looks like a staff PIN. A pairing code has letters in it and comes from the dashboard.";
    }
    if (clean.length < 6) {
      const left = 6 - clean.length;
      return `${left} more character${left === 1 ? "" : "s"} to go.`;
    }
    if (clean.length > 6) return "That is longer than 6 characters. Check the code again.";
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
    <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
      <form onSubmit={submit} className="w-full max-w-sm">
        <p className="text-sm font-medium text-teal-light">Ascend POS</p>
        <h1 className="mt-4 text-2xl font-semibold leading-display">
          Set up this till.
        </h1>
        <p className="mt-3 text-white/70">
          On the Ascend dashboard, open Your tills and tap Set up a new till.
          Type the code it shows here. You only do this once.
        </p>
        <p className="mt-2 text-sm text-white/50">
          This is not a staff PIN. Those come later, once the till is set up.
        </p>

        <label htmlFor="code" className="mt-8 block text-sm text-white/70">
          Pairing code
        </label>
        <input
          id="code"
          value={code}
          autoFocus
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC-234"
          className="mt-2 w-full bg-white/10 px-4 py-3 text-2xl font-semibold tracking-widest text-white placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-white/60 focus:outline-none"
        />

        {error ? (
          <p className="mt-3 text-sm text-gold">{error}</p>
        ) : (
          hint && <p className="mt-3 text-sm text-white/60">{hint}</p>
        )}

        <button
          type="submit"
          disabled={busy || clean.length !== 6}
          className="tap mt-6 w-full bg-teal py-3.5 text-lg font-semibold disabled:opacity-40"
        >
          {busy ? "Setting up your till..." : "Set up this till"}
        </button>
        <p className="mt-3 text-center text-sm text-white/50">
          This step needs network. Selling does not.
        </p>
      </form>
    </main>
  );
}
