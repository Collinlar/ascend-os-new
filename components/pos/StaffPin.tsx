"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/brand/Mark";
import {
  getRoster,
  lockRemainingMs,
  pullRoster,
  signInWithPin,
  type ActiveCashier,
} from "@/lib/pos/staff";
import TillNotReady from "./TillNotReady";
import { clearRegistration } from "@/lib/pos/registration";
import { pendingCount } from "@/lib/pos/outbox";

// Who is at the till. Four taps and they are selling — a cashier changing
// mid-rush should not be a workflow (POS-014).

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export default function StaffPin({
  onSignedIn,
  businessLabel,
}: {
  onSignedIn: (cashier: ActiveCashier) => void;
  businessLabel?: string | null;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  // Whether anyone can open this till at all. Checked up front, because
  // making a cashier tap four digits and wait on a hash before telling them
  // nobody has a PIN is a cruel way to deliver that news.
  const [hasRoster, setHasRoster] = useState<boolean | null>(null);
  const [recheckingRoster, setRecheckingRoster] = useState(false);
  // Turning this device into a different till. Rare, consequential, and the
  // only way out of a device paired to the wrong till.
  const [switching, setSwitching] = useState(false);
  const [unsent, setUnsent] = useState<number | null>(null);

  // Count a lockout down in front of the cashier rather than leaving them
  // tapping a dead pad.
  useEffect(() => {
    lockRemainingMs().then(setLockedFor).catch(() => {});
    getRoster()
      .then((r) => setHasRoster(r.length > 0))
      .catch(() => setHasRoster(null));
  }, []);

  // The owner sets a PIN on their phone while the cashier waits at the
  // counter, so this has to be re-checkable without restarting the app.
  async function recheck() {
    setRecheckingRoster(true);
    try {
      await pullRoster();
      setHasRoster((await getRoster()).length > 0);
    } catch {
      // Offline. The roster cannot have changed for us either way.
    } finally {
      setRecheckingRoster(false);
    }
  }

  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setInterval(() => {
      setLockedFor((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedFor]);

  async function submit(fullPin: string) {
    setChecking(true);
    setError(null);
    try {
      const result = await signInWithPin(fullPin);
      if (result.ok) {
        onSignedIn(result.cashier);
        return;
      }
      setPin("");
      if (result.reason === "locked") {
        setLockedFor(result.waitMs ?? 60_000);
        setError("Too many wrong tries. Wait a moment, then try again.");
      } else if (result.reason === "no_roster") {
        setError("This till does not know anyone yet. Connect to network once.");
      } else {
        setError(
          result.triesLeft === 1
            ? "Wrong PIN. One try left before the till locks."
            : `Wrong PIN. ${result.triesLeft} tries left.`
        );
      }
    } catch {
      setPin("");
      setError("We could not check that PIN. Tap the numbers again.");
    } finally {
      setChecking(false);
    }
  }

  // Digits are appended functionally, never from the closed-over `pin`.
  // A cashier taps a PIN faster than React re-renders, and reading state
  // from the closure loses or doubles digits under exactly that speed.
  function press(key: string) {
    if (checking || lockedFor > 0) return;
    setError(null);

    if (key === "back") {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (key === "") return;

    setPin((prev) => (prev.length >= 4 ? prev : prev + key));
  }

  // The fourth digit signs them in. Submitting from an effect rather than
  // from the tap handler means it fires once, on the state that actually
  // landed, however fast the taps arrived.
  useEffect(() => {
    if (pin.length === 4 && !checking && lockedFor <= 0) {
      submit(pin);
    }
    // submit is stable for the lifetime of this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function beginSwitch() {
    // Unpairing throws away the device's local store, so anything still
    // queued is money that never reaches the business. Refuse while the
    // till is holding some.
    const waiting = await pendingCount().catch(() => 0);
    setUnsent(waiting);
    setSwitching(true);
  }

  async function confirmSwitch() {
    await clearRegistration();
    window.location.href = "/pos";
  }

  const locked = lockedFor > 0;

  if (hasRoster === false) {
    return (
      <main className="flex min-h-screen flex-col bg-navy text-white">
        <TillNotReady
          reason="no_roster"
          businessLabel={businessLabel}
          onRetry={recheck}
          retrying={recheckingRoster}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 text-white">
      <div className="w-full max-w-[320px]">
        <Eyebrow tone="mint">{businessLabel ?? "Ascend POS"}</Eyebrow>
        <h1 className="mt-3 text-title font-extrabold">Who is on the till?</h1>
        <p className="mt-2 text-sm text-on-dark">
          Enter your 4 digit PIN to start selling.
        </p>

        {/* Filled dots, so the cashier can see progress without seeing digits */}
        <div className="mt-8 flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition-colors ${
                i < pin.length ? "bg-teal-mint" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        <p className="mt-4 min-h-[20px] text-center text-sm text-gold">
          {locked
            ? `Locked for ${Math.ceil(lockedFor / 1000)}s`
            : checking
              ? "Checking..."
              : (error ?? "")}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {KEYS.map((key, i) => (
            <button
              key={i}
              onClick={() => press(key)}
              disabled={key === "" || locked || checking}
              className={`num tap h-16 rounded-panel text-2xl font-bold transition-colors ${
                key === ""
                  ? "invisible"
                  : "bg-white/10 active:bg-teal disabled:opacity-40"
              }`}
              aria-label={key === "back" ? "Delete" : key}
            >
              {key === "back" ? "←" : key}
            </button>
          ))}
        </div>

        <p className="mono mt-6 text-center text-[11px] text-white/60">
          Your PIN identifies you on this till. It is not your account password.
        </p>

        {/* The way out of a device paired as the wrong till. Deliberately
            quiet: a cashier mid-shift has no reason to be here. */}
        {switching ? (
          <div className="mt-4 rounded-panel bg-white/10 p-4 text-center">
            {unsent && unsent > 0 ? (
              <>
                <p className="text-sm font-bold">
                  This till still has {unsent} sale{unsent === 1 ? "" : "s"} to send.
                </p>
                <p className="mt-1 text-sm text-on-dark">
                  Setting it up as a different till would lose them. Get back on
                  network first, then try again.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold">
                  Use this device as a different till?
                </p>
                <p className="mt-1 text-sm text-on-dark">
                  It stops being {businessLabel ?? "this till"} and asks for a new
                  pairing code. Nothing already sent is affected.
                </p>
                <button
                  onClick={confirmSwitch}
                  className="tap mt-3 w-full rounded-control bg-teal py-3 font-semibold"
                >
                  Yes, set up a different till
                </button>
              </>
            )}
            <button
              onClick={() => setSwitching(false)}
              className="tap mt-2 w-full rounded-control border border-white/25 py-2.5 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={beginSwitch}
            className="tap mt-3 w-full text-center text-[11px] text-white/60 underline"
          >
            This device should be a different till
          </button>
        )}
      </div>
    </main>
  );
}
