"use client";

import { useState } from "react";
import { callApi } from "@/lib/http";
import { REPORT_REASONS, type ReportSource } from "@/lib/risk/reports";

// "Report a problem with this business" (Risk and Trust R4). Sits quietly at
// the foot of the invoice page, the shop and the booking page. It opens in
// place, asks what went wrong, and sends it to Ascend, not to the business.

export default function ReportProblem({
  source,
  token,
  slug,
  businessName,
}: {
  source: ReportSource;
  token?: string;
  slug?: string;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!reason) {
      setError("Pick what went wrong, then send.");
      return;
    }
    setSending(true);
    setError(null);
    const result = await callApi<{ ok: true }>("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, token, slug, reason, detail, phone }),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-8 border-t border-line pt-5" role="status">
        <p className="text-sm font-semibold text-ink">Your report reached Ascend.</p>
        <p className="mt-1 text-sm text-ink-muted">
          A person at Ascend reads every report. {businessName} is not told who sent it.
          {phone.trim() ? " If we need more, we will message you on WhatsApp." : ""}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Report a problem with this business
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="report-heading" className="mt-8 border-t border-line pt-5 text-left">
      <h2 id="report-heading" className="text-base font-semibold text-ink">
        What went wrong with {businessName}?
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        This goes to Ascend, the platform {businessName} uses. It does not go to the business.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">What went wrong</legend>
        <div className="flex flex-col gap-2">
          {REPORT_REASONS.map((r) => (
            <label
              key={r.key}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 border px-4 py-2 text-sm ${
                reason === r.key ? "border-teal bg-teal-light text-teal-dark" : "border-line text-ink"
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                value={r.key}
                checked={reason === r.key}
                onChange={() => setReason(r.key)}
                className="h-4 w-4 accent-teal"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="report-detail" className="mt-4 block text-sm font-medium text-ink">
        Tell us what happened
      </label>
      <textarea
        id="report-detail"
        value={detail}
        onChange={(e) => setDetail(e.target.value.slice(0, 600))}
        rows={3}
        placeholder="When it happened, how much you paid, what they said"
        className="mt-1 w-full border border-line px-3 py-2 text-base text-ink"
      />
      <p className="mt-1 text-right text-xs text-ink-muted">{600 - detail.length} left</p>

      <label htmlFor="report-phone" className="mt-2 block text-sm font-medium text-ink">
        Your WhatsApp number, if you want us to reply
      </label>
      <input
        id="report-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="024 000 0000"
        className="mt-1 min-h-[44px] w-full border border-line px-3 text-base text-ink"
      />

      {error && (
        <p className="mt-3 bg-gold-light px-4 py-3 text-sm text-gold-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="tap flex min-h-[44px] flex-1 items-center justify-center bg-teal px-4 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-60"
        >
          {sending ? "Sending your report to Ascend..." : "Send my report"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="tap flex min-h-[44px] items-center justify-center border border-line px-4 text-sm font-semibold text-ink"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
