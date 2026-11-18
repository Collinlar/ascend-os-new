"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel } from "@/components/shell/Page";

// BVM's messaging desk: deletion requests to complete, and a business's
// daily marketing limit to change. Each acts on real people's data or
// reach, so each says what it will do before it does it.

export interface DeletionRow {
  requestId: string;
  numberEnds: string;
  requestedAt: string;
  daysLeft: number;
  businessNames: string[];
}

export interface LimitBusiness {
  businessId: string;
  name: string;
  cap: number;
  /** The last change BVM made, from the database, so it survives a refresh. */
  lastChange: { reason: string; at: string } | null;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function MessagingDesk({
  requests,
  businesses,
  canAct,
}: {
  requests: DeletionRow[];
  businesses: LimitBusiness[];
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [limitFor, setLimitFor] = useState(businesses[0]?.businessId ?? "");
  const [cap, setCap] = useState("");
  const [reason, setReason] = useState("");

  async function post(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("We could not reach Ascend just now. Check the connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const chosen = businesses.find((b) => b.businessId === limitFor);

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">{error}</p>
      )}

      <section aria-labelledby="deletions">
        <h2 id="deletions" className="mb-3 text-base font-bold text-ink">
          Deletion requests
        </h2>
        {requests.length === 0 ? (
          <EmptyState
            title="No one is waiting on a deletion."
            detail="When a customer replies DELETE on WhatsApp, their request lands here with 30 days to complete it."
          />
        ) : (
          <Panel>
            {requests.map((r, i) => (
              <div
                key={r.requestId}
                className={`px-5 py-4 ${i < requests.length - 1 ? "border-b border-line-soft" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-ink">Number ending {r.numberEnds.replace("…", "")}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-grey">
                      Asked {DATE.format(new Date(r.requestedAt))}.{" "}
                      {r.businessNames.length > 0
                        ? `Held by ${r.businessNames.join(", ")}.`
                        : "No business holds this number."}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-extrabold ${
                      r.daysLeft <= 7 ? "bg-danger-tint text-danger-ink" : "bg-light-grey text-ink-muted"
                    }`}
                  >
                    {r.daysLeft === 0 ? "Due today" : `${r.daysLeft} days left`}
                  </span>
                </div>

                {canAct &&
                  (confirming === r.requestId ? (
                    <div className="mt-3 rounded-panel border border-line bg-surface px-4 py-3">
                      <p className="text-sm font-medium text-ink-muted">
                        This removes the number, email and notes from every business that holds them, and the
                        number from message records. Invoices and receipts stay with each business. It cannot be
                        undone.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={async () => {
                            if (await post({ action: "complete_deletion", requestId: r.requestId }, r.requestId)) {
                              setConfirming(null);
                            }
                          }}
                          disabled={busy === r.requestId}
                          className="tap flex min-h-[44px] items-center rounded-chip bg-danger-tint px-4 text-sm font-bold text-danger-ink disabled:opacity-60"
                        >
                          {busy === r.requestId ? "Removing their details..." : "Remove their details now"}
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate"
                        >
                          Not yet
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(r.requestId)}
                      className="tap mt-3 flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate hover:bg-light-grey"
                    >
                      Complete this deletion
                    </button>
                  ))}
              </div>
            ))}
          </Panel>
        )}
      </section>

      {canAct && businesses.length > 0 && (
        <section aria-labelledby="limit">
          <h2 id="limit" className="mb-1 text-base font-bold text-ink">
            Daily marketing limit
          </h2>
          <p className="mb-3 text-sm font-medium text-slate-grey">
            200 a day unless set here. Receipts, invoices and staff messages are never limited.
          </p>
          <Panel className="px-5 py-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await post(
                  { action: "set_limit", businessId: limitFor, dailyMarketingCap: Number(cap), reason },
                  "limit"
                );
                if (ok) {
                  setCap("");
                  setReason("");
                }
              }}
              className="grid gap-3"
            >
              <label className="grid gap-1 text-sm font-semibold text-ink">
                Which business?
                <select
                  value={limitFor}
                  onChange={(e) => setLimitFor(e.target.value)}
                  className="min-h-[44px] rounded-panel border border-line bg-surface px-3 text-base font-medium text-ink"
                >
                  {businesses.map((b) => (
                    <option key={b.businessId} value={b.businessId}>
                      {b.name} (now {b.cap} a day)
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold text-ink">
                How many marketing messages a day?
                <input
                  value={cap}
                  onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  required
                  placeholder={String(chosen?.cap ?? 200)}
                  className="min-h-[44px] rounded-panel border border-line bg-surface px-3 text-base font-medium text-ink"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-ink">
                Why?
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={10}
                  placeholder="They asked for a launch week, say"
                  className="min-h-[44px] rounded-panel border border-line bg-surface px-3 text-base font-medium text-ink"
                />
              </label>
              <button
                type="submit"
                disabled={busy === "limit"}
                className="tap flex min-h-[44px] items-center justify-center rounded-chip bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === "limit" ? "Changing the limit..." : "Change their daily limit"}
              </button>
              <p className="text-sm font-medium text-slate-grey" aria-live="polite">
                {chosen?.lastChange
                  ? `Set to ${chosen.cap} a day on ${DATE.format(new Date(chosen.lastChange.at))}: ${chosen.lastChange.reason}`
                  : `${chosen?.name ?? "This business"} is on the usual 200 a day.`}
              </p>
            </form>
          </Panel>
        </section>
      )}
    </div>
  );
}
