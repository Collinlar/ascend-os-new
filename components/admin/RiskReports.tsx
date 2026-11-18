"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel } from "@/components/shell/Page";
import { REASON_FOR_DESK, SOURCE_FOR_DESK } from "@/lib/risk/reports";

// Customer reports waiting for a person. Each one can be dismissed, turned
// into a case, or added to the business's open case. A report never changes
// anything about the business by itself; opening a case does not either.

export interface ReportRow {
  reportId: string;
  businessName: string;
  source: string;
  reason: string;
  detail: string | null;
  numberEnds: string | null;
  reportedAt: string;
  openCaseId: string | null;
  reportsOnBusiness: number;
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Outcome = "dismiss" | "open_case" | "add_to_case";
const OUTCOME_LABEL: Record<Outcome, string> = {
  open_case: "Open a case from this",
  add_to_case: "Add to the open case",
  dismiss: "Dismiss it",
};
const OUTCOME_BUSY: Record<Outcome, string> = {
  open_case: "Opening the case...",
  add_to_case: "Adding it to the case...",
  dismiss: "Dismissing the report...",
};

export default function RiskReports({ reports, canAct }: { reports: ReportRow[]; canAct: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState<{ id: string; outcome: Outcome } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(r: ReportRow, outcome: Outcome) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review_report", reportId: r.reportId, outcome, caseId: r.openCaseId, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Try again.");
        return;
      }
      setWorking(null);
      setNote("");
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title="No customer reports to read."
        detail="When a customer reports a business from an invoice, the shop or a booking page, it lands here."
      />
    );
  }

  return (
    <Panel>
      {reports.map((r, i) => {
        const outcomes: Outcome[] = r.openCaseId ? ["add_to_case", "open_case", "dismiss"] : ["open_case", "dismiss"];
        const mine = working?.id === r.reportId;
        return (
          <div key={r.reportId} className={`px-5 py-4 ${i < reports.length - 1 ? "border-b border-line-soft" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-bold text-ink">{r.businessName}</p>
              <p className="text-sm font-medium text-slate-grey">{WHEN.format(new Date(r.reportedAt))}</p>
            </div>
            <p className="mt-0.5 text-sm font-semibold text-gold-ink">
              {REASON_FOR_DESK[r.reason] ?? r.reason}, {SOURCE_FOR_DESK[r.source] ?? r.source}
            </p>
            {r.detail && <p className="mt-1 whitespace-pre-line text-sm text-ink">&ldquo;{r.detail}&rdquo;</p>}
            <p className="mt-1 text-sm font-medium text-slate-grey">
              {r.numberEnds ? `Left a WhatsApp number ending ${r.numberEnds}.` : "Left no number."}
              {r.reportsOnBusiness > 1 && ` ${r.reportsOnBusiness} open reports on this business.`}
              {r.openCaseId && " This business has an open case."}
            </p>

            {canAct &&
              (mine ? (
                <div className="mt-3 rounded-panel border border-line bg-surface px-4 py-3">
                  <label htmlFor={`note-${r.reportId}`} className="block text-sm font-semibold text-ink">
                    What did you find?
                  </label>
                  <textarea
                    id={`note-${r.reportId}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder={
                      working.outcome === "dismiss"
                        ? "Why this needs no action"
                        : "What the customer says, and why it is worth a case"
                    }
                    className="mt-1 w-full rounded-chip border border-line px-3 py-2 text-base text-ink"
                  />
                  {error && <p className="mt-2 text-sm font-semibold text-gold-ink">{error}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => review(r, working.outcome)}
                      disabled={busy}
                      className="tap flex min-h-[44px] items-center rounded-chip bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy ? OUTCOME_BUSY[working.outcome] : OUTCOME_LABEL[working.outcome]}
                    </button>
                    <button
                      onClick={() => {
                        setWorking(null);
                        setError(null);
                      }}
                      className="tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate"
                    >
                      Back to the list
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {outcomes.map((o) => (
                    <button
                      key={o}
                      onClick={() => {
                        setWorking({ id: r.reportId, outcome: o });
                        setNote("");
                        setError(null);
                      }}
                      className="tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate hover:bg-light-grey"
                    >
                      {OUTCOME_LABEL[o]}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        );
      })}
    </Panel>
  );
}
