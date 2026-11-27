"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel as Surface } from "@/components/shell/Page";
import Pills from "@/components/shell/Pills";

// What is in Discover, and what somebody has asked us to reconsider
// (round 3, P3, 0148).
//
// Taking a listing off Discover is the strongest thing this platform does to
// a business: it removes reach they may have paid for. So the reason is
// required, the business sees it, and every decision is attributed. Asking
// for a change flags the exact words; an appeal against a removal is
// decided by someone other than who removed it.

export interface ModerationRow {
  listingId: string;
  businessId: string;
  businessName: string;
  itemName: string | null;
  description: string | null;
  city: string | null;
  category: string | null;
  status: string;
  suspendedReason: string | null;
  changeReason: string | null;
  flaggedText: string | null;
  appealNote: string | null;
  appealed: boolean;
  resubmitted: boolean;
  evidence: Array<{ name: string; url: string }>;
  shopSlug: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  eligible: "Listed",
  pending_review: "Waiting for a decision",
  suspended: "Off Discover",
  withdrawn: "Not listed",
};

type Open = { listingId: string; mode: "change" | "remove" | "refuse" } | null;

export default function ModerationQueue({ rows }: { rows: ModerationRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("Waiting");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [reason, setReason] = useState("");
  const [flag, setFlag] = useState("");
  const [query, setQuery] = useState("");

  const waiting = rows.filter((r) => r.status === "pending_review");
  const off = rows.filter((r) => r.status === "suspended");
  const listed = rows.filter((r) => r.status === "eligible");
  const pool = filter === "Waiting" ? waiting : filter === "Off Discover" ? off : filter === "Listed" ? listed : rows;
  const shown = query.trim()
    ? pool.filter((r) => `${r.businessName} ${r.itemName ?? ""} ${r.city ?? ""} ${r.category ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : pool;

  async function act(listingId: string, body: Record<string, unknown>) {
    setBusy(listingId);
    setError(null);
    try {
      const res = await fetch("/api/admin/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, ...body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Try again.");
        return;
      }
      setOpen(null);
      setReason("");
      setFlag("");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <p className="mb-3.5 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">{error}</p>}

      <Pills
        pills={[
          { label: "Waiting", count: waiting.length },
          { label: "Off Discover", count: off.length },
          { label: "Listed", count: listed.length },
          { label: "Everything" },
        ]}
        active={filter}
        onPick={setFilter}
        trailing={`${shown.length} ${shown.length === 1 ? "listing" : "listings"}`}
      />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a business, product, city or category"
        aria-label="Search listings"
        className="mb-3.5 w-full rounded-panel border border-line bg-surface px-4 font-medium text-ink outline-none placeholder:text-slate-grey focus:border-teal"
      />

      {shown.length === 0 ? (
        <EmptyState
          title={filter === "Waiting" ? "Nothing waiting for a decision." : `Nothing under ${filter.toLowerCase()}.`}
          detail={filter === "Waiting" ? "Resubmitted listings and appeals land here." : "Try another filter."}
        />
      ) : (
        <Surface>
          {shown.map((row, i) => (
            <div key={row.listingId} className={`px-[22px] py-4 ${i < shown.length - 1 ? "border-b border-line-soft" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-[15px] font-bold text-ink">{row.businessName}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${
                        row.status === "suspended"
                          ? "bg-danger-tint text-danger-ink"
                          : row.status === "eligible"
                            ? "bg-teal-light text-teal-dark"
                            : row.status === "pending_review"
                              ? "bg-gold-light text-gold-ink"
                              : "bg-light-grey text-ink-muted"
                      }`}
                    >
                      {row.status === "pending_review" ? (row.appealed ? "Appeal" : row.resubmitted ? "Resubmitted" : STATUS_LABEL[row.status]) : STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] font-medium text-slate-grey">
                    {row.itemName ?? "The business itself"}
                    {row.city && ` · ${row.city}`}
                    {row.category && ` · ${row.category}`}
                  </p>
                  {row.description && <p className="mt-1.5 text-[13px] text-ink-muted">{row.description}</p>}
                  {row.suspendedReason && (
                    <p className="mt-2 rounded-panel bg-danger-tint px-3.5 py-2.5 text-[12.5px] font-semibold text-danger-ink">
                      {row.changeReason ? "Asked to change" : "Removed"}: {row.suspendedReason}
                      {row.flaggedText && <span className="block font-medium">Flagged: &ldquo;{row.flaggedText}&rdquo;</span>}
                    </p>
                  )}
                  {row.appealNote && (
                    <p className="mt-2 rounded-panel border border-line bg-surface px-3.5 py-2.5 text-[12.5px] font-medium text-ink-muted">
                      <span className="font-bold text-ink">Their appeal:</span> {row.appealNote}
                    </p>
                  )}
                  {row.evidence.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-2 text-[12.5px]">
                      {row.evidence.map((f) => (
                        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="font-bold text-teal-dark underline underline-offset-2">
                          {f.name}
                        </a>
                      ))}
                    </p>
                  )}
                </div>

                <div className="flex w-full flex-none flex-wrap justify-end gap-2 sm:w-auto">
                  {row.shopSlug && (
                    <a href={`/s/${row.shopSlug}`} target="_blank" rel="noreferrer" className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey">
                      See the shop
                    </a>
                  )}
                  {row.status === "pending_review" && (
                    <>
                      <button
                        onClick={() => act(row.listingId, { action: "decide_listing", restore: true })}
                        disabled={busy === row.listingId}
                        className="tap flex items-center rounded-chip bg-teal-light px-4 text-[13px] font-bold text-teal-dark hover:bg-teal-pale disabled:opacity-60"
                      >
                        Put it back
                      </button>
                      <button onClick={() => setOpen({ listingId: row.listingId, mode: "refuse" })} className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate">
                        Keep it off
                      </button>
                    </>
                  )}
                  {row.status === "eligible" && (
                    <>
                      {row.itemName && (
                        <button onClick={() => setOpen({ listingId: row.listingId, mode: "change" })} className="tap flex items-center rounded-chip bg-gold-light px-4 text-[13px] font-bold text-gold-ink">
                          Ask for a change
                        </button>
                      )}
                      <button onClick={() => setOpen({ listingId: row.listingId, mode: "remove" })} className="tap flex items-center rounded-chip bg-danger-tint px-4 text-[13px] font-bold text-danger-ink">
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              {open?.listingId === row.listingId && (
                <div className="mt-3 rounded-panel bg-surface px-4 py-3.5">
                  <label htmlFor={`reason-${row.listingId}`} className="text-xs font-bold text-ink-muted">
                    {open.mode === "change" ? "What needs to change, and why?" : open.mode === "remove" ? "Why is this coming off Discover?" : "Why does it stay off?"}
                  </label>
                  <textarea
                    id={`reason-${row.listingId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="The business reads this."
                    className="mt-1.5 w-full resize-none rounded-control border border-line-strong bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-slate-grey focus:border-teal"
                  />
                  {open.mode === "change" && (
                    <>
                      <label htmlFor={`flag-${row.listingId}`} className="mt-2 block text-xs font-bold text-ink-muted">
                        The exact words to highlight in the description (optional)
                      </label>
                      <input
                        id={`flag-${row.listingId}`}
                        value={flag}
                        onChange={(e) => setFlag(e.target.value)}
                        placeholder="Cures eczema in 3 days."
                        className="mt-1.5 min-h-[44px] w-full rounded-control border border-line-strong bg-white px-3.5 text-sm font-medium text-ink outline-none placeholder:text-slate-grey focus:border-teal"
                      />
                    </>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() =>
                        act(
                          row.listingId,
                          open.mode === "refuse"
                            ? { action: "decide_listing", restore: false, reason }
                            : { action: "moderate", kind: open.mode, reason, flaggedText: flag }
                        )
                      }
                      disabled={busy === row.listingId || reason.trim().length < 10}
                      className="tap flex items-center rounded-control bg-danger-ink px-[18px] text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      {busy === row.listingId ? "Working..." : open.mode === "change" ? "Ask for the change" : open.mode === "remove" ? "Remove from Discover" : "Keep it off"}
                    </button>
                    <button onClick={() => setOpen(null)} className="tap flex items-center rounded-control border border-line px-[18px] text-[13px] font-bold text-ink-slate">
                      Not now
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Surface>
      )}
    </div>
  );
}
