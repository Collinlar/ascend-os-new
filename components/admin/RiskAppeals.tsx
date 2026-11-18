"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel } from "@/components/shell/Page";

// Appeals from businesses Ascend has limited (Risk and Trust R5). Accepting
// moves the business to monitor (or normal) and lifts every restriction;
// declining keeps it where it is. Either way the note is what the business
// reads as Ascend's answer.

export interface AppealRow {
  appealId: string;
  businessName: string;
  stateAppealed: string;
  appealText: string;
  submittedAt: string;
  madeByYou: boolean;
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Choice = { decision: "accepted"; newState: "monitor" | "normal" } | { decision: "declined" };
const LABEL = (c: Choice) =>
  c.decision === "declined" ? "Decline the appeal" : c.newState === "normal" ? "Accept, back to normal" : "Accept, keep watching";
const BUSY = (c: Choice) => (c.decision === "declined" ? "Sending the answer..." : "Lifting the limits...");
const CHOICES: Choice[] = [
  { decision: "accepted", newState: "monitor" },
  { decision: "accepted", newState: "normal" },
  { decision: "declined" },
];

export default function RiskAppeals({ appeals, canAct }: { appeals: AppealRow[]; canAct: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState<{ id: string; choice: Choice } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(a: AppealRow, choice: Choice) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decide_appeal",
          appealId: a.appealId,
          decision: choice.decision,
          newState: choice.decision === "accepted" ? choice.newState : undefined,
          note,
        }),
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

  if (appeals.length === 0) {
    return <EmptyState title="No appeals waiting." detail="When an owner appeals a restriction or a suspension, it lands here." />;
  }

  return (
    <Panel>
      {appeals.map((a, i) => (
        <div key={a.appealId} className={`px-5 py-4 ${i < appeals.length - 1 ? "border-b border-[#EEF3F7]" : ""}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[15px] font-bold text-ink">{a.businessName}</p>
            <p className="text-sm font-medium text-slate-grey">{WHEN.format(new Date(a.submittedAt))}</p>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-gold-ink">Appealing: {a.stateAppealed}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink">&ldquo;{a.appealText}&rdquo;</p>

          {canAct &&
            (a.madeByYou && a.stateAppealed !== "restricted" ? (
              <p className="mt-2 text-sm font-medium text-slate-grey">
                You made this decision, so another admin hears the appeal against it.
              </p>
            ) : working?.id === a.appealId ? (
              <div className="mt-3 rounded-panel border border-line bg-surface px-4 py-3">
                <label htmlFor={`answer-${a.appealId}`} className="block text-sm font-semibold text-ink">
                  Your answer. {a.businessName} reads this.
                </label>
                <textarea
                  id={`answer-${a.appealId}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={
                    working.choice.decision === "declined"
                      ? "What did not add up, and what would change the decision"
                      : "What you checked, and that the limits are lifted"
                  }
                  className="mt-1 w-full rounded-chip border border-line px-3 py-2 text-base text-ink"
                />
                {error && <p className="mt-2 text-sm font-semibold text-gold-ink">{error}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => decide(a, working.choice)}
                    disabled={busy}
                    className="tap flex min-h-[44px] items-center rounded-chip bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {busy ? BUSY(working.choice) : LABEL(working.choice)}
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
                {CHOICES.map((c) => (
                  <button
                    key={LABEL(c)}
                    onClick={() => {
                      setWorking({ id: a.appealId, choice: c });
                      setNote("");
                      setError(null);
                    }}
                    className="tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate hover:bg-light-grey"
                  >
                    {LABEL(c)}
                  </button>
                ))}
              </div>
            ))}
        </div>
      ))}
    </Panel>
  );
}
