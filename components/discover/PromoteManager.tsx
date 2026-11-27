"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { Panel } from "@/components/shell/Page";

export interface ListingRow {
  id: string;
  status: string;
  name: string;
  city: string | null;
  suspendedReason: string | null;
}

export interface CampaignRow {
  campaign_id: string;
  status: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  orders: number;
  bookings: number;
}

const CAMPAIGN_STATUS: Record<string, { text: string; cls: string }> = {
  running: { text: "Running", cls: "bg-success-tint text-success-ink" },
  paused: { text: "Paused", cls: "bg-neutral-100 text-neutral-700" },
  exhausted: { text: "Budget used up", cls: "bg-gold-100 text-gold-700" },
  ended: { text: "Ended", cls: "bg-neutral-100 text-neutral-700" },
  draft: { text: "Not started", cls: "bg-neutral-100 text-neutral-700" },
};

const LISTING_STATUS: Record<string, string> = {
  eligible: "Showing to customers",
  pending_review: "Being reviewed",
  suspended: "Taken down",
  withdrawn: "You removed this",
};

export default function PromoteManager({
  balance,
  listings,
  campaigns,
  compact = false,
}: {
  balance: number;
  listings: ListingRow[];
  campaigns: CampaignRow[];
  /** Inside the Promotions overview (round 3), which draws the figures
   *  and the campaigns itself: only the listings and starting a promotion. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budgetFor, setBudgetFor] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function post(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/discover/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That did not go through. Tap again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const seen = campaigns.reduce((n, c) => n + Number(c.impressions), 0);
  const tapped = campaigns.reduce((n, c) => n + Number(c.clicks), 0);
  const came = campaigns.reduce((n, c) => n + Number(c.orders) + Number(c.bookings), 0);
  const input =
    "min-h-[44px] rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-control bg-gold-100 px-4 py-3 text-sm font-semibold text-gold-700">{error}</p>}

      {!compact && (
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">Ascend Balance</p>
          <p className="num mt-1 font-heading text-[26px] font-extrabold text-ink-heading">{formatGHS(balance)}</p>
          <p className="mt-1 text-[12.5px] text-neutral-600">
            {balance < 10 ? "Too low to promote much. " : ""}Pays for promotion. Separate from your sales money.
          </p>
        </Panel>
        {campaigns.length > 0 && (
          <>
            <Figure label="Seen on Discover" value={seen.toLocaleString("en-GH")} note="All your promotions, since they started" />
            <Figure label="Tapped through to you" value={tapped.toLocaleString("en-GH")} note={seen > 0 ? `${Math.round((tapped / seen) * 100)}% of those who saw it` : "Nobody yet"} />
            <Figure label="Ordered or booked after" value={came.toLocaleString("en-GH")} note="Traced from a tap on Discover" />
          </>
        )}
      </div>
      )}

      <section>
        <h2 className="font-heading text-[18px] font-extrabold text-ink-heading">Where you appear</h2>
        <Panel className="mt-3">
          {listings.length === 0 && (
            <p className="px-5 py-4 text-sm text-neutral-600">
              You are not listed on Discover yet. Products with a photo and a price on a live shop are listed for free.
            </p>
          )}
          {listings.map((listing, i) => (
            <div key={listing.id} className={`px-5 py-4 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14.5px] font-semibold text-ink">
                  {listing.name}
                  {listing.city ? <span className="font-normal text-neutral-600"> · {listing.city}</span> : null}
                </p>
                <span
                  className={`rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${
                    listing.status === "eligible"
                      ? "bg-success-tint text-success-ink"
                      : listing.status === "suspended"
                        ? "bg-danger-tint text-danger-ink"
                        : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {LISTING_STATUS[listing.status] ?? listing.status}
                </span>
              </div>

              {/* A suspension the merchant cannot understand or answer is
                  just removal. */}
              {listing.status === "suspended" && (
                <div className="mt-3 rounded-control bg-gold-100 px-3 py-3">
                  <p className="text-sm font-semibold text-gold-700">{listing.suspendedReason ?? "No reason was recorded."}</p>
                  {appealFor === listing.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Tell us what we should look at again"
                        className={`w-full py-2 ${input}`}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAppealFor(null)}
                          className="tap flex flex-1 items-center justify-center rounded-control border-[1.5px] border-neutral-200 bg-white text-sm font-bold text-ink"
                        >
                          Leave it
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await post(listing.id, { action: "appeal", listingId: listing.id, note });
                            if (ok) {
                              setAppealFor(null);
                              setNote("");
                            }
                          }}
                          disabled={busy === listing.id}
                          className="tap flex flex-[2] items-center justify-center rounded-control bg-teal text-sm font-bold text-white disabled:opacity-60"
                        >
                          {busy === listing.id ? "Sending your appeal..." : "Send my appeal"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAppealFor(listing.id)} className="tap mt-1 text-sm font-bold text-gold-700 underline">
                      I think this is wrong
                    </button>
                  )}
                </div>
              )}

              {listing.status === "pending_review" && (
                <p className="mt-2 text-sm text-neutral-600">A person is looking at this. We will message you on WhatsApp when it is decided.</p>
              )}

              {listing.status === "eligible" && (
                <div className="mt-3">
                  {budgetFor === listing.id ? (
                    <div className="flex flex-wrap gap-2">
                      <label className="sr-only" htmlFor={`budget-${listing.id}`}>
                        Budget in GH₵
                      </label>
                      <input
                        id={`budget-${listing.id}`}
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        inputMode="decimal"
                        placeholder="How much, in GH₵"
                        className={`num min-w-0 flex-1 ${input}`}
                      />
                      <button
                        onClick={async () => {
                          const ok = await post(listing.id, { action: "start_campaign", listingId: listing.id, budget: parseFloat(budget) });
                          if (ok) {
                            setBudgetFor(null);
                            setBudget("");
                          }
                        }}
                        disabled={busy === listing.id}
                        className="tap flex items-center rounded-control bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {busy === listing.id ? "Starting it..." : "Start promoting it"}
                      </button>
                      <button onClick={() => setBudgetFor(null)} className="tap flex items-center px-3 text-sm font-semibold text-neutral-600">
                        Leave it
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setBudgetFor(listing.id)}
                      className="tap flex items-center rounded-control border-[1.5px] border-line-brand px-4 text-sm font-bold text-teal-800 hover:bg-teal-50"
                    >
                      Pay to appear higher
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </Panel>
      </section>

      {!compact && campaigns.length > 0 && (
        <section>
          <h2 className="font-heading text-[18px] font-extrabold text-ink-heading">Your promotions</h2>
          <Panel className="mt-3">
            {campaigns.map((campaign, i) => {
              const spent = Number(campaign.spent);
              const budget = Number(campaign.budget);
              const share = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
              const chip = CAMPAIGN_STATUS[campaign.status] ?? { text: campaign.status, cls: "bg-neutral-100 text-neutral-700" };
              return (
                <div key={campaign.campaign_id} className={`px-5 py-4 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="num text-[14.5px] font-semibold text-ink">
                      {formatGHS(spent)} of {formatGHS(budget)} spent
                    </p>
                    <span className={`rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>
                  </div>
                  {/* The progress fill is one of the few places a gradient carries meaning. */}
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-brand to-teal" style={{ width: `${share}%` }} />
                  </div>
                  <p className="mt-2 text-[13px] text-neutral-600">
                    Seen {Number(campaign.impressions).toLocaleString("en-GH")} times · {campaign.clicks} tapped through
                    {campaign.orders > 0 && ` · ${campaign.orders} ordered`}
                    {campaign.bookings > 0 && ` · ${campaign.bookings} booked`}
                  </p>
                  {campaign.status === "running" && (
                    <button
                      onClick={() => post(campaign.campaign_id, { action: "pause_campaign", campaignId: campaign.campaign_id })}
                      disabled={busy === campaign.campaign_id}
                      className="tap mt-1 flex items-center text-sm font-bold text-teal-800 disabled:opacity-60"
                    >
                      {busy === campaign.campaign_id ? "Pausing it..." : "Pause this promotion"}
                    </button>
                  )}
                </div>
              );
            })}
          </Panel>
          <p className="mt-3 text-[12.5px] text-neutral-600">
            These numbers are reach. They do not affect your Sustainability Score, and paying for promotion never will.
          </p>
        </section>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Panel className="px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">{label}</p>
      <p className="num mt-1 font-heading text-[26px] font-extrabold text-ink-heading">{value}</p>
      <p className="mt-1 text-[12.5px] text-neutral-600">{note}</p>
    </Panel>
  );
}
