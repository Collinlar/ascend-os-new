"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

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
}: {
  balance: number;
  listings: ListingRow[];
  campaigns: CampaignRow[];
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
        setError(data.error ?? "We could not do that. Tap again.");
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

  return (
    <div className="space-y-8">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}

      <p className="border border-line bg-white px-4 py-3 text-sm text-ink-muted">
        Ascend Balance{" "}
        <span className="font-medium text-ink">{formatGHS(balance)}</span>
        {balance < 10 && (
          <span className="text-gold-dark"> · too low to promote much</span>
        )}
      </p>

      <section>
        <h2 className="text-sm font-medium text-ink-muted">Where you appear</h2>
        <div className="mt-3 space-y-2">
          {listings.length === 0 && (
            <p className="border border-line bg-white px-4 py-4 text-sm text-ink-muted">
              You are not listed on Discover yet.
            </p>
          )}

          {listings.map((listing) => (
            <div key={listing.id} className="border border-line bg-white px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{listing.name}</p>
                <p
                  className={`text-sm ${
                    listing.status === "eligible" ? "text-teal-dark" : "text-ink-muted"
                  }`}
                >
                  {LISTING_STATUS[listing.status] ?? listing.status}
                </p>
              </div>

              {/* A suspension the merchant cannot understand or answer is
                  just removal. */}
              {listing.status === "suspended" && (
                <div className="mt-3 bg-gold-light px-3 py-3">
                  <p className="text-sm text-gold-dark">
                    {listing.suspendedReason ?? "No reason was recorded."}
                  </p>
                  {appealFor === listing.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Tell us what we should reconsider"
                        className="w-full border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAppealFor(null)}
                          className="tap flex-1 border border-line bg-white py-2 text-sm font-medium text-ink"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await post(listing.id, {
                              action: "appeal",
                              listingId: listing.id,
                              note,
                            });
                            if (ok) {
                              setAppealFor(null);
                              setNote("");
                            }
                          }}
                          disabled={busy === listing.id}
                          className="tap flex-[2] bg-teal py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Send my appeal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAppealFor(listing.id)}
                      className="tap mt-2 text-sm font-medium text-gold-dark underline"
                    >
                      I think this is wrong
                    </button>
                  )}
                </div>
              )}

              {listing.status === "pending_review" && (
                <p className="mt-2 text-sm text-ink-muted">
                  A person is looking at this. We will message you on WhatsApp
                  when it is decided.
                </p>
              )}

              {listing.status === "eligible" && (
                <div className="mt-3">
                  {budgetFor === listing.id ? (
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        inputMode="decimal"
                        placeholder="Budget in GHS"
                        className="flex-1 border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
                      />
                      <button
                        onClick={async () => {
                          const ok = await post(listing.id, {
                            action: "start_campaign",
                            listingId: listing.id,
                            budget: parseFloat(budget),
                          });
                          if (ok) {
                            setBudgetFor(null);
                            setBudget("");
                          }
                        }}
                        disabled={busy === listing.id}
                        className="tap bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => setBudgetFor(null)}
                        className="tap px-3 py-2 text-sm font-medium text-ink-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setBudgetFor(listing.id)}
                      className="tap border border-teal px-4 py-2 text-sm font-medium text-teal-dark"
                    >
                      Pay to appear higher
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {campaigns.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-ink-muted">What you have spent</h2>
          <div className="mt-3 space-y-2">
            {campaigns.map((campaign) => (
              <div
                key={campaign.campaign_id}
                className="border border-line bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    {formatGHS(Number(campaign.spent))} of{" "}
                    {formatGHS(Number(campaign.budget))} spent
                  </p>
                  <p className="text-sm text-ink-muted">{campaign.status}</p>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Seen {campaign.impressions} times · {campaign.clicks} people
                  tapped through
                  {campaign.orders > 0 && ` · ${campaign.orders} ordered`}
                  {campaign.bookings > 0 && ` · ${campaign.bookings} booked`}
                </p>
                {campaign.status === "running" && (
                  <button
                    onClick={() =>
                      post(campaign.campaign_id, {
                        action: "pause_campaign",
                        campaignId: campaign.campaign_id,
                      })
                    }
                    disabled={busy === campaign.campaign_id}
                    className="tap mt-3 text-sm font-medium text-ink-muted disabled:opacity-60"
                  >
                    Pause this
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            These numbers are reach. They do not affect your Sustainability
            Score, and paying for promotion never will.
          </p>
        </section>
      )}
    </div>
  );
}
