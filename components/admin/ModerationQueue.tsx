"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel as Surface } from "@/components/shell/Page";
import Pills from "@/components/shell/Pills";

// What is in Discover, and what somebody has asked us to reconsider.
//
// Suspension is the strongest thing this platform does to a business: it
// removes reach they may have paid for. So the reason is required, the
// business sees it, and every decision is attributed.

export interface ModerationRow {
  listingId: string;
  businessId: string;
  businessName: string;
  itemName: string | null;
  city: string | null;
  category: string | null;
  status: string;
  suspendedReason: string | null;
  appealNote: string | null;
  shopSlug: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  eligible: "Listed",
  pending_review: "Waiting on review",
  suspended: "Suspended",
  withdrawn: "Not listed",
};

export default function ModerationQueue({ rows }: { rows: ModerationRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("Appeals");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");

  const appeals = rows.filter((r) => r.status === "suspended" && r.appealNote);
  const suspended = rows.filter((r) => r.status === "suspended" && !r.appealNote);
  const listed = rows.filter((r) => r.status === "eligible");

  const pool =
    filter === "Appeals"
      ? appeals
      : filter === "Suspended"
        ? suspended
        : filter === "Listed"
          ? listed
          : rows;

  const shown = query.trim()
    ? pool.filter((r) =>
        `${r.businessName} ${r.itemName ?? ""} ${r.city ?? ""} ${r.category ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : pool;

  async function act(
    listingId: string,
    action: "suspend" | "decide",
    extra: { reason?: string; restore?: boolean } = {}
  ) {
    setBusy(listingId);
    setError(null);
    try {
      const res = await fetch("/api/admin/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, listingId, ...extra }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Try again.");
        return;
      }
      setOpenFor(null);
      setReason("");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3.5 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      <Pills
        pills={[
          { label: "Appeals", count: appeals.length },
          { label: "Suspended", count: suspended.length },
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
          title={
            filter === "Appeals"
              ? "No appeals waiting."
              : `Nothing under ${filter.toLowerCase()}.`
          }
          detail={
            filter === "Appeals"
              ? "When a suspended business answers, it lands here."
              : "Try another filter."
          }
        />
      ) : (
        <Surface>
          {shown.map((row, i) => (
            <div
              key={row.listingId}
              className={`px-[22px] py-4 ${
                i < shown.length - 1 ? "border-b border-[#EEF3F7]" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-[15px] font-bold text-ink">
                      {row.businessName}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${
                        row.status === "suspended"
                          ? "bg-danger-tint text-danger-ink"
                          : row.status === "eligible"
                            ? "bg-teal-light text-teal-dark"
                            : "bg-light-grey text-ink-muted"
                      }`}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] font-medium text-slate-grey">
                    {row.itemName ?? "The business itself"}
                    {row.city && ` · ${row.city}`}
                    {row.category && ` · ${row.category}`}
                  </p>

                  {row.suspendedReason && (
                    <p className="mt-2 rounded-panel bg-danger-tint px-3.5 py-2.5 text-[12.5px] font-semibold text-danger-ink">
                      Suspended: {row.suspendedReason}
                    </p>
                  )}
                  {row.appealNote && (
                    <p className="mt-2 rounded-panel border border-line bg-surface px-3.5 py-2.5 text-[12.5px] font-medium text-ink-muted">
                      <span className="font-bold text-ink">They answered:</span>{" "}
                      {row.appealNote}
                    </p>
                  )}
                </div>

                <div className="flex w-full flex-none flex-wrap justify-end gap-2 sm:w-auto">
                  {row.shopSlug && (
                    <a
                      href={`/s/${row.shopSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
                    >
                      See the shop
                    </a>
                  )}

                  {row.status === "suspended" ? (
                    <>
                      <button
                        onClick={() => act(row.listingId, "decide", { restore: true })}
                        disabled={busy === row.listingId}
                        className="tap flex items-center rounded-chip bg-teal-light px-4 text-[13px] font-bold text-teal-dark hover:bg-teal-pale disabled:opacity-60"
                      >
                        Put it back
                      </button>
                      {row.appealNote && (
                        <button
                          onClick={() =>
                            act(row.listingId, "decide", {
                              restore: false,
                              reason: row.suspendedReason ?? undefined,
                            })
                          }
                          disabled={busy === row.listingId}
                          className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate disabled:opacity-60"
                        >
                          Keep it off
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setOpenFor(openFor === row.listingId ? null : row.listingId);
                        setReason("");
                      }}
                      className="tap flex items-center rounded-chip bg-danger-tint px-4 text-[13px] font-bold text-danger-ink"
                    >
                      Suspend
                    </button>
                  )}
                </div>
              </div>

              {openFor === row.listingId && (
                <div className="mt-3 rounded-panel bg-[#F6F9FB] px-4 py-3.5">
                  <label
                    htmlFor={`reason-${row.listingId}`}
                    className="text-xs font-bold text-ink-muted"
                  >
                    Why is this coming down?
                  </label>
                  <textarea
                    id={`reason-${row.listingId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="The business sees this and can appeal it."
                    className="mt-1.5 w-full resize-none rounded-control border border-line-strong bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-slate-grey focus:border-teal"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => act(row.listingId, "suspend", { reason })}
                      disabled={busy === row.listingId || reason.trim().length < 4}
                      className="tap flex items-center rounded-control bg-danger-ink px-[18px] text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      {busy === row.listingId ? "Working..." : "Suspend this listing"}
                    </button>
                    <button
                      onClick={() => setOpenFor(null)}
                      className="tap flex items-center rounded-control border border-line px-[18px] text-[13px] font-bold text-ink-slate"
                    >
                      Cancel
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
