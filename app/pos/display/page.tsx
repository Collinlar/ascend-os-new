"use client";

// @contrast-surface white
// The customer display, from the v3 Counter Register design: what is being
// bought on the left, what to pay on the right in deep teal. It runs in a
// second window on the till's own device, dragged to the screen that faces
// the customer, and hears everything from the till (lib/pos/display.ts). It
// needs no network and opens no storage, so it never competes with the till
// for its records.

import { useEffect, useState } from "react";
import { formatGHS } from "@/lib/money";
import { displayReceiver, type DisplayState } from "@/lib/pos/display";
import { Icon } from "@/components/shell/icons";

export default function CustomerDisplay() {
  const [s, setS] = useState<DisplayState | null>(null);
  const [full, setFull] = useState(false);
  // The way to fill the screen is for whoever sets the display up, once.
  // It shows when the window opens or the pointer moves, then gets out of
  // the customer's way.
  const [showFill, setShowFill] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setShowFill(false), 8000);
    const wake = () => {
      setShowFill(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowFill(false), 8000);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, []);

  useEffect(() => displayReceiver(setS), []);
  useEffect(() => {
    const follow = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", follow);
    return () => document.removeEventListener("fullscreenchange", follow);
  }, []);

  const business = s?.business ?? "Ascend POS";

  return (
    <main className="relative flex h-[100dvh] bg-white text-ink">
      {!full && showFill && (
        <button
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          className="tap absolute bottom-3 left-3 z-10 flex items-center rounded-control border border-line-brand bg-white px-3 text-[13px] font-semibold text-neutral-700"
        >
          Fill this screen
        </button>
      )}

      {!s || s.stage === "welcome" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-teal-800 px-10 text-center text-white">
          {/* @contrast-surface #005F57 */}
          <span className="text-[14px] font-semibold uppercase tracking-[0.18em] text-white/80">Welcome to</span>
          <span className="font-heading text-[clamp(36px,6vw,72px)] font-extrabold leading-tight">{business}</span>
          <span className="text-[18px] text-white/85">We take cash, Mobile Money and card.</span>
          {!s && <span className="mt-6 text-[14px] text-white/70">Waiting for the till. Open the till on this device to start.</span>}
          {/* @contrast-surface white */}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-[34px] py-[30px]">
            <span className="flex items-center justify-between gap-4">
              <span className="truncate font-heading text-[22px] font-extrabold text-ink-heading">{business}</span>
              {s.servedBy && <span className="flex-none text-[15px] text-neutral-600">Served by {s.servedBy}</span>}
            </span>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100">
              {s.lines.map((l, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3.5 border-b border-neutral-100 py-3.5 text-[clamp(16px,1.8vw,20px)]">
                  <span className="min-w-0">
                    <span className="num text-neutral-600">{l.qty} ×</span> {l.name}
                  </span>
                  <span className="num flex-none font-bold">{formatGHS(l.total)}</span>
                </div>
              ))}
              {s.discount && (
                <div className="flex items-baseline justify-between gap-3.5 border-b border-neutral-100 py-3.5 text-[clamp(16px,1.8vw,20px)] text-danger-ink">
                  <span>{s.discount.label}</span>
                  <span className="num flex-none font-bold">−{formatGHS(s.discount.amount)}</span>
                </div>
              )}
            </div>
            <span className="text-[14px] text-neutral-600">Check your total before you pay. Ask the cashier for your receipt.</span>
          </div>

          <div className="flex w-[clamp(300px,38vw,420px)] flex-none flex-col gap-4 bg-teal-800 px-[34px] py-[30px] text-white">
            {/* @contrast-surface #005F57 */}
            <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/80">
              {s.stage === "thanks" ? "Paid" : "To pay"}
            </span>
            <span className="num font-heading text-[clamp(40px,5vw,60px)] font-extrabold leading-none tracking-[-0.02em]">{formatGHS(s.total)}</span>
            {s.stage === "paying" && s.method && <span className="text-[17px] text-white/90">By {s.method}</span>}

            {s.stage === "thanks" ? (
              <div className="mt-auto flex flex-col gap-3">
                <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white">
                  <Icon name="check" size={34} />
                </span>
                <span className="font-heading text-[30px] font-extrabold leading-tight">
                  Thank you{s.customerFirst ? `, ${s.customerFirst}` : ""}.
                </span>
                {s.change !== undefined && (
                  <span className="num text-[18px] text-white/90">Your change is {formatGHS(s.change)}.</span>
                )}
              </div>
            ) : (
              <div className="mt-auto flex flex-col gap-2.5 rounded-card bg-white/10 p-4">
                <span className="text-[16px] font-bold">
                  {s.customerFirst ? `Welcome back, ${s.customerFirst}` : "We take cash, Mobile Money and card."}
                </span>
                {s.customerFirst && <span className="text-[14.5px] text-white/85">We take cash, Mobile Money and card.</span>}
              </div>
            )}
            {/* @contrast-surface white */}
          </div>
        </>
      )}
    </main>
  );
}
