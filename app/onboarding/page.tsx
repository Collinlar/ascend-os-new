"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// Onboarding (§12): understand the job, get to first value fast, defer
// everything non-essential (ONB-008). Flow: business details and WhatsApp
// number, then the WhatsApp code, then the business exists and we route
// straight toward first value.

const PATH_COPY: Record<
  string,
  { headline: string; firstValue: string; cta: string; destination: string }
> = {
  pos: {
    headline: "Let's set up your selling counter.",
    firstValue: "You will complete a test sale before this session ends.",
    cta: "Set up my counter",
    destination: "/pos",
  },
  shop: {
    headline: "Let's build your Shop from your product photos.",
    firstValue: "You will see your Shop preview before we ask for anything else.",
    cta: "Build my Shop",
    destination: "/dashboard",
  },
  services: {
    headline: "Let's get your services bookable.",
    firstValue: "Your booking page will be live within this session.",
    cta: "Make me bookable",
    destination: "/dashboard",
  },
  documents: {
    headline: "Let's create your first professional document.",
    firstValue: "Your first quote or invoice will be ready to share in minutes.",
    cta: "Create my first document",
    destination: "/dashboard",
  },
};

type Step = "details" | "code" | "creating";

function OnboardingInner() {
  const params = useSearchParams();
  const router = useRouter();
  const path = params.get("path") ?? "pos";
  const copy = PATH_COPY[path] ?? PATH_COPY.pos;

  const [step, setStep] = useState<Step>("details");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (businessName.trim().length < 2) {
      setError("Give your business its name so customers recognise it.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Tell us your name so your team knows who did what.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That did not go through. Tap send again.");
        return;
      }
      setDevCode(data.devCode ?? null);
      setStep("code");
    } catch {
      setError("We could not reach the network just now. Tap send again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, fullName }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error ?? "That code does not match. Check your WhatsApp and try again.");
        if (verifyData.exhausted) setStep("details");
        return;
      }

      setStep("creating");
      const createRes = await fetch("/api/business/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName,
          city,
          entryProductSet: path,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error ?? "We could not set up your business just now. Tap again.");
        setStep("code");
        return;
      }
      router.push(copy.destination);
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-5 pb-24 pt-14">
        <p className="text-sm font-medium text-teal-dark">AscendSME</p>

        {step === "details" && (
          <>
            <h1 className="mt-6 text-3xl font-semibold leading-display text-ink">
              {copy.headline}
            </h1>
            <p className="mt-3 text-ink-muted">{copy.firstValue}</p>

            <form className="mt-10 space-y-5" onSubmit={requestCode}>
              <Field
                id="businessName"
                label="Your business"
                value={businessName}
                onChange={setBusinessName}
                placeholder="What's your business called?"
              />
              <Field
                id="city"
                label="Where you operate"
                value={city}
                onChange={setCity}
                placeholder="Which city are you based in?"
              />
              <Field
                id="fullName"
                label="Your name"
                value={fullName}
                onChange={setFullName}
                placeholder="What should we call you?"
              />
              <Field
                id="phone"
                label="Your WhatsApp number"
                value={phone}
                onChange={setPhone}
                placeholder="024 XXX XXXX"
                inputMode="tel"
              />

              {error && <p className="text-sm text-gold-dark">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="tap w-full bg-teal px-5 py-3.5 font-medium text-white transition-colors hover:bg-teal-dark disabled:opacity-50"
              >
                {busy ? "Reaching your WhatsApp..." : "Send my WhatsApp code"}
              </button>
              <p className="text-center text-sm text-ink-muted">
                No card needed. Your records stay yours.
              </p>
            </form>

            {/* The other door, said before they fill any of this in. An
                owner who came here to get back into a business they already
                have would otherwise retype everything we already store, and
                end up with a second empty one. */}
            <p className="mt-8 text-center text-sm text-ink-muted">
              Already have a business with us?{" "}
              <Link href="/signin" className="font-semibold text-teal-dark underline">
                Sign in instead
              </Link>
            </p>
          </>
        )}

        {step === "code" && (
          <>
            <h1 className="mt-6 text-3xl font-semibold leading-display text-ink">
              Check your WhatsApp.
            </h1>
            <p className="mt-3 text-ink-muted">
              We sent a 6 digit code to {phone}. It expires in 10 minutes.
            </p>
            {devCode && (
              <p className="mt-2 bg-gold-light px-3 py-2 text-sm text-gold-ink">
                Development mode: your code is {devCode}
              </p>
            )}

            <form className="mt-10 space-y-5" onSubmit={verifyAndCreate}>
              <Field
                id="code"
                label="Your code"
                value={code}
                onChange={setCode}
                placeholder="6 digits from WhatsApp"
                inputMode="numeric"
              />
              {error && <p className="text-sm text-gold-dark">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.trim().length !== 6}
                className="tap w-full bg-teal px-5 py-3.5 font-medium text-white transition-colors hover:bg-teal-dark disabled:opacity-50"
              >
                {busy ? "Checking your code..." : copy.cta}
              </button>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="tap w-full text-sm font-medium text-teal-dark"
              >
                Use a different number
              </button>
            </form>
          </>
        )}

        {step === "creating" && (
          <div className="mt-24 text-center">
            <h1 className="text-2xl font-semibold text-ink">
              Setting up {businessName}...
            </h1>
            <p className="mt-3 text-ink-muted">
              Creating your business record, your first location and your owner access.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode?: "tel" | "numeric";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full border border-line px-4 py-3 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
      />
    </div>
  );
}

export default function Onboarding() {
  return (
    <Suspense>
      <OnboardingInner />
    </Suspense>
  );
}
