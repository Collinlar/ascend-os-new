"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface MotCheck {
  key: string;
  verdict: string;
  finding: string;
  action: string | null;
}

const CHECK_NAMES: Record<string, string> = {
  trading_consistency: "Are you recording your trading?",
  cash_reconciliation: "Is your cash being counted?",
  collections: "Are you getting paid?",
  device_health: "Are your tills sending their sales?",
  documentation: "Is there a paper trail?",
  nothing_stuck: "Is anything waiting on you?",
  identity: "Is your business identity verified?",
};

const VERDICT: Record<string, { label: string; tone: string; border: string }> = {
  pass: { label: "Fine", tone: "text-teal-dark", border: "border-line" },
  attention: {
    label: "Worth a look",
    tone: "text-gold-dark",
    border: "border-line border-l-4 border-l-gold",
  },
  action_required: {
    label: "Needs fixing",
    tone: "text-gold-dark",
    border: "border-line border-l-4 border-l-gold-dark",
  },
  not_applicable: {
    label: "Does not apply",
    tone: "text-mid-grey",
    border: "border-line",
  },
};

const OVERALL_COPY: Record<string, { headline: string; detail: string }> = {
  pass: {
    headline: "Everything checks out.",
    detail: "Nothing needs fixing right now. Keep trading the way you are.",
  },
  attention: {
    headline: "A few things worth a look.",
    detail: "Nothing is broken, but these would make your record stronger.",
  },
  action_required: {
    headline: "Some things need fixing.",
    detail: "These affect whether your record can be trusted. Start at the top.",
  },
};

export default function MotReview({
  hasReview,
  overall,
  checks,
  reviewedAt,
  nextDueAt,
}: {
  hasReview: boolean;
  overall: string;
  checks: MotCheck[];
  reviewedAt?: string;
  nextDueAt?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness/mot", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not run the check-up. Tap again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasReview) {
    return (
      <div className="mt-10">
        {error && <p className="mb-4 text-sm text-gold-dark">{error}</p>}
        <div className="border border-line bg-light-grey px-5 py-6">
          <p className="font-medium text-ink">You have not had a check-up yet.</p>
          <p className="mt-2 text-sm text-mid-grey">
            It takes a moment and reads only your own records. Nothing is sent
            anywhere.
          </p>
          <button
            onClick={run}
            disabled={busy}
            className="tap mt-4 bg-teal px-5 py-3 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Checking your business..." : "Run my first check-up"}
          </button>
        </div>
      </div>
    );
  }

  const summary = OVERALL_COPY[overall] ?? OVERALL_COPY.attention;
  const needsWork = checks.filter(
    (c) => c.verdict === "action_required" || c.verdict === "attention"
  );
  const fine = checks.filter(
    (c) => c.verdict === "pass" || c.verdict === "not_applicable"
  );

  return (
    <div className="mt-10">
      {error && <p className="mb-4 text-sm text-gold-dark">{error}</p>}

      <section
        className={`border px-5 py-5 ${
          overall === "pass" ? "border-teal bg-teal-light" : "border-gold bg-gold-light"
        }`}
      >
        <p
          className={`text-xl font-semibold ${
            overall === "pass" ? "text-teal-dark" : "text-gold-dark"
          }`}
        >
          {summary.headline}
        </p>
        <p
          className={`mt-1 text-sm ${
            overall === "pass" ? "text-teal-dark" : "text-gold-dark"
          }`}
        >
          {summary.detail}
        </p>
        {reviewedAt && (
          <p className="mt-3 text-xs text-mid-grey">
            Checked {new Date(reviewedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            {nextDueAt &&
              ` · next one due ${new Date(nextDueAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
              })}`}
          </p>
        )}
      </section>

      {needsWork.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-mid-grey">What to do</h2>
          <div className="mt-3 space-y-3">
            {needsWork.map((check) => {
              const verdict = VERDICT[check.verdict] ?? VERDICT.attention;
              return (
                <div key={check.key} className={`border px-5 py-4 ${verdict.border}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">
                      {CHECK_NAMES[check.key] ?? check.key}
                    </p>
                    <p className={`text-sm ${verdict.tone}`}>{verdict.label}</p>
                  </div>
                  <p className="mt-1 text-sm text-ink">{check.finding}</p>
                  {check.action && (
                    <p className="mt-2 text-sm text-mid-grey">{check.action}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {fine.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-mid-grey">Checked and fine</h2>
          <div className="mt-3 space-y-2">
            {fine.map((check) => {
              const verdict = VERDICT[check.verdict] ?? VERDICT.pass;
              return (
                <div
                  key={check.key}
                  className="flex flex-wrap items-baseline justify-between gap-2 border border-line px-4 py-3"
                >
                  <p className="text-sm text-ink">
                    {CHECK_NAMES[check.key] ?? check.key}
                  </p>
                  <p className={`text-sm ${verdict.tone}`}>{verdict.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button
        onClick={run}
        disabled={busy}
        className="tap mt-8 w-full border border-teal px-5 py-3 font-medium text-teal-dark disabled:opacity-60"
      >
        {busy ? "Checking your business..." : "Run it again now"}
      </button>
    </div>
  );
}
