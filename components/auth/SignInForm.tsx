"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BusinessChooser, { type ChoosableBusiness } from "./BusinessChooser";

// Signing back in.
//
// A returning owner already told us their business name, their city and
// their own name. Asking again is not a form, it is an accusation that we
// lost their records. All this needs is the number the business was set up
// with and the code we send to it.

type Step = "number" | "code" | "choose";

export default function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("number");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<ChoosableBusiness[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unknownNumber, setUnknownNumber] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  // The wait before another code can be asked for, counted down rather than
  // hidden, so nobody taps a dead button wondering what they did wrong.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setUnknownNumber(false);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Tap send again.");
        if (data?.retryAfterSeconds) setResendIn(data.retryAfterSeconds);
        return;
      }
      setDevCode(data?.devCode ?? null);
      setResendIn(60);
      setStep("code");
    } catch {
      setError("We could not reach the network just now. Tap send again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, intent: "signin" }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "That code does not match. Check your WhatsApp and try again.");
        // An unknown number is not a wrong code, and retyping will not fix
        // it. They need the other door, not another attempt.
        if (data?.unknownNumber) setUnknownNumber(true);
        if (data?.exhausted) {
          setStep("number");
          setCode("");
        }
        return;
      }

      // Verified but never finished setting a business up. Send them back
      // to where they stopped rather than to an empty dashboard.
      if (!data?.hasBusiness) {
        router.push("/onboarding");
        return;
      }

      const list: ChoosableBusiness[] = data.businesses ?? [];
      if (list.length > 1) {
        setBusinesses(list);
        setStep("choose");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-5 pb-24 pt-14">
        <Link href="/" className="mono text-[11px] uppercase tracking-eyebrow text-teal-dark">
          AscendSME
        </Link>

        {step === "number" && (
          <>
            <h1 className="mt-6 text-3xl font-extrabold leading-display tracking-[-0.02em] text-ink">
              Welcome back.
            </h1>
            <p className="mt-3 text-ink-muted">
              Enter the WhatsApp number your business is set up with. We send a
              code to it.
            </p>

            <form className="mt-10 space-y-5" onSubmit={sendCode}>
              <div>
                <label htmlFor="phone" className="block text-sm font-bold text-ink">
                  Your WhatsApp number
                </label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  placeholder="024 XXX XXXX"
                  className="num mt-2 w-full rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal"
                />
              </div>

              {error && <p className="text-sm font-semibold text-danger">{error}</p>}

              <button
                type="submit"
                disabled={busy || phone.trim().length < 9}
                className="tap flex w-full items-center justify-center rounded-panel bg-teal font-bold text-white disabled:opacity-50"
              >
                {busy ? "Sending your code..." : "Send my WhatsApp code"}
              </button>
            </form>

            <p className="mt-8 text-sm text-ink-muted">
              No business here yet?{" "}
              <Link href="/" className="font-bold text-teal-dark underline">
                Start one
              </Link>
            </p>
          </>
        )}

        {step === "code" && (
          <>
            <h1 className="mt-6 text-3xl font-extrabold leading-display tracking-[-0.02em] text-ink">
              Check your WhatsApp.
            </h1>
            <p className="num mt-3 text-ink-muted">
              We sent a 6 digit code to {phone}.
            </p>

            {devCode && (
              <p className="mono mt-4 rounded-control bg-gold-light px-4 py-3 text-sm text-gold-dark">
                Development mode, no WhatsApp provider configured. Your code is{" "}
                <strong>{devCode}</strong>.
              </p>
            )}

            <form className="mt-8 space-y-5" onSubmit={verify}>
              <div>
                <label htmlFor="code" className="block text-sm font-bold text-ink">
                  Your code
                </label>
                <input
                  id="code"
                  ref={codeInput}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="num mt-2 w-full rounded-control border border-line-strong bg-surface px-4 text-center text-2xl font-bold tracking-[0.4em] text-ink outline-none placeholder:tracking-[0.4em] placeholder:text-slate-grey focus:border-teal"
                />
              </div>

              {error && <p className="text-sm font-semibold text-danger">{error}</p>}

              {/* The one error retyping cannot fix, so it offers the way out
                  instead of the way round again. */}
              {unknownNumber && (
                <div className="rounded-panel border border-line bg-surface p-4">
                  <p className="text-sm font-medium text-ink-muted">
                    Nothing is set up on this number. If you started the
                    business on a different WhatsApp number, sign in with that
                    one instead.
                  </p>
                  <Link
                    href="/"
                    className="tap mt-3 inline-flex items-center rounded-control bg-ink px-5 text-sm font-bold text-white"
                  >
                    Start a business on this number
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="tap flex w-full items-center justify-center rounded-panel bg-teal font-bold text-white disabled:opacity-50"
              >
                {busy ? "Checking your code..." : "Open my business"}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep("number");
                    setCode("");
                    setError(null);
                    setUnknownNumber(false);
                  }}
                  className="tap text-sm font-bold text-ink-muted"
                >
                  Use another number
                </button>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={busy || resendIn > 0}
                  className="tap text-sm font-bold text-teal-dark disabled:text-slate-grey"
                >
                  {resendIn > 0 ? `Send again in ${resendIn}s` : "Send another code"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "choose" && (
          <>
            <h1 className="mt-6 text-3xl font-extrabold leading-display tracking-[-0.02em] text-ink">
              Which one today?
            </h1>
            <p className="mt-3 text-ink-muted">
              You run more than one business on this number.
            </p>

            <div className="mt-8">
              <BusinessChooser businesses={businesses} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
