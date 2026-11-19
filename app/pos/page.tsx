"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
//
// Ascend POS Terminal Mode: fast, restricted, genuinely offline-capable
// (CHN-003, POS-002, POS PRD §17). The engine is lib/pos/useTill.ts; this
// page decides which screen the till is on (setup, who is at the till,
// the shift, a stopped till) and then hands over to the selling screen.
import { useEffect, useState } from "react";
import { pendingCount } from "@/lib/pos/outbox";
import { clearRegistration } from "@/lib/pos/registration";
import TerminalSetup from "@/components/pos/TerminalSetup";
import ShiftGate from "@/components/pos/ShiftGate";
import ShiftClose from "@/components/pos/ShiftClose";
import StaffPin from "@/components/pos/StaffPin";
import SellScreen from "@/components/pos/SellScreen";
import TerminalLayout from "@/components/pos/TerminalLayout";
import { Eyebrow } from "@/components/brand/Mark";
import { useTill } from "@/lib/pos/useTill";

export default function PosTerminal() {
  const till = useTill();
  const {
    ready,
    unavailable,
    blockedByOtherTab,
    registered,
    setRegistered,
    device,
    revoked,
    locked,
    shift,
    status,
    cashier,
    setCashier,
    boot,
    syncNow,
    afterShiftClosed,
  } = till;
  const [closing, setClosing] = useState(false);
  // A pairing code arriving in the address on a till that is already paired.
  // Someone opened the link meaning "make this device that till", and
  // ignoring it silently is how an owner concludes the link is broken.
  const [codeInLink, setCodeInLink] = useState<string | null>(null);
  const [switchUnsent, setSwitchUnsent] = useState<number | null>(null);

  // Which layout: the handheld Terminal below 1024px, the big screen above.
  // By width, not by how the device was set up, because a till set up as a
  // terminal may be a handheld or a counter screen. Until the Counter layout
  // exists (D4c) the wide screen keeps the till's earlier selling screen.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const follow = () => setWide(query.matches);
    follow();
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("code");
    if (linked) setCodeInLink(linked.toUpperCase());
  }, []);

  if (ready && registered === false) {
    return (
      <TerminalSetup
        onPaired={() => {
          // The code in the address has just been used. Left there, it made a
          // till that had paired a second ago ask whether to pair again.
          setCodeInLink(null);
          window.history.replaceState({}, "", "/pos");
          setRegistered(true);
          boot();
        }}
      />
    );
  }

  // Arrived with a pairing code on a till that is already set up. Offer the
  // swap rather than pretending the code was not there.
  if (ready && registered && codeInLink) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-6 text-white">
        <div className="w-full max-w-sm text-center">
          <Eyebrow tone="mint">{device?.label ?? "Ascend POS"}</Eyebrow>
          <h1 className="mt-3 text-xl font-extrabold">
            This device is already {device?.label ?? "a till"}.
          </h1>
          <p className="mt-2 text-sm text-on-dark">
            You opened a pairing code here. Setting this device up as the new
            till stops it being {device?.label ?? "this one"}.
          </p>

          {switchUnsent && switchUnsent > 0 ? (
            <p className="mt-4 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-ink">
              It still has {switchUnsent} sale{switchUnsent === 1 ? "" : "s"} to
              send. Get back on network first, or those are lost.
            </p>
          ) : (
            <button
              onClick={async () => {
                const waiting = await pendingCount().catch(() => 0);
                if (waiting > 0) {
                  setSwitchUnsent(waiting);
                  return;
                }
                await clearRegistration();
                window.location.href = `/pos?code=${encodeURIComponent(codeInLink)}`;
              }}
              className="tap mt-5 w-full rounded-control bg-teal py-3.5 font-semibold"
            >
              Set this device up as the new till
            </button>
          )}

          <button
            onClick={() => {
              setCodeInLink(null);
              window.history.replaceState({}, "", "/pos");
            }}
            className="tap mt-3 w-full rounded-control border border-white/25 py-3 text-sm font-bold"
          >
            No, keep selling as {device?.label ?? "this till"}
          </button>
        </div>
      </main>
    );
  }

  // Who is at the till, before anything is sold in their name (POS-014).
  if (ready && registered && !cashier && !locked) {
    return (
      <StaffPin
        businessLabel={device?.label}
        onSignedIn={(signedIn) => {
          setCashier(signedIn);
          boot();
        }}
      />
    );
  }

  // Sales belong to a shift, so the drawer can be reconciled at the end of
  // the day (POS-SHF-001).
  if (ready && registered && !shift && !locked) {
    return <ShiftGate onOpened={boot} cashierMembershipId={cashier?.membershipId} />;
  }

  if (ready && shift && closing) {
    return (
      <ShiftClose
        cashierMembershipId={cashier?.membershipId}
        shift={shift}
        onCancel={() => setClosing(false)}
        onClosed={async () => {
          setClosing(false);
          await afterShiftClosed();
        }}
      />
    );
  }

  if (ready && locked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">
            {revoked ? "This till has been stopped." : "This till needs to check in."}
          </h1>
          <p className="mt-3 text-white/70">
            {revoked
              ? "The owner stopped this till. Your saved sales are safe on this device. Call the owner to set it up again."
              : "It has been selling offline for a while. Connect to network once and it will keep going."}
          </p>
          {status.pending > 0 && (
            <p className="mt-3 text-gold">
              {status.pending} sale{status.pending === 1 ? "" : "s"} still saved here.
            </p>
          )}
          {!revoked && (
            <button
              onClick={syncNow}
              className="tap mt-6 w-full bg-teal py-3.5 font-semibold"
            >
              Check in now
            </button>
          )}
        </div>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy px-5 text-white">
        <div className="max-w-sm text-center">
          {blockedByOtherTab ? (
            <>
              <h1 className="text-xl font-semibold">
                The till is open somewhere else.
              </h1>
              <p className="mt-3 text-white/70">
                Close the other tab or window showing this till, then tap
                below. Your sales are safe.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="tap mt-5 w-full rounded-control bg-teal py-3.5 font-semibold"
              >
                I have closed it, open the till
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">
                This till cannot save sales here.
              </h1>
              <p className="mt-3 text-white/70">
                The browser is blocking local storage, so a sale could be lost.
                Open the till in the Ascend app, or turn off private browsing.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return wide ? (
    <SellScreen till={till} onCloseShift={() => setClosing(true)} />
  ) : (
    <TerminalLayout till={till} onCloseShift={() => setClosing(true)} />
  );
}
