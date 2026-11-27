"use client";

// Campaigns waiting for review (round 3, P2). Approve starts it today;
// decline needs a reason the business will read.

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ReviewRow {
  campaignId: string;
  businessName: string;
  what: string;
  kind: string;
  dailyBudget: number;
  days: number;
  places: string;
  interests: string[];
  submittedAt: string;
  shopSlug: string | null;
}

const KIND: Record<string, string> = { product: "Product Boost", service: "Service Boost", shop: "Shop Boost", location: "Location Boost" };

export default function CampaignReview({ rows }: { rows: ReviewRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review_campaign", campaignId: id, approve, reason: reason[id] ?? "" }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) setError(out.error ?? "That did not go through. Tap again.");
      else router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Tap again.");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return <p className="text-sm text-ink-muted">No campaigns waiting for review.</p>;
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-control bg-danger-tint px-3 py-2 text-sm font-semibold text-danger-ink">
          {error}
        </p>
      )}
      {rows.map((r) => (
        <div key={r.campaignId} className="flex flex-col gap-2 rounded-panel border border-line bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[15px] font-bold text-ink">{r.businessName}</p>
            <p className="text-xs text-ink-muted">
              Sent {new Date(r.submittedAt).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <p className="text-sm text-ink">
            {KIND[r.kind] ?? r.kind}: <strong>{r.what}</strong>
          </p>
          <p className="text-sm text-ink-muted">
            GHS {r.dailyBudget} a day for {r.days} days · {r.places}
            {r.interests.length ? ` · for "${r.interests.join('", "')}"` : ""}
          </p>
          {r.shopSlug && (
            <a href={`/s/${r.shopSlug}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-teal-dark underline underline-offset-2">
              Open their shop
            </a>
          )}
          <input
            value={reason[r.campaignId] ?? ""}
            onChange={(e) => setReason((p) => ({ ...p, [r.campaignId]: e.target.value }))}
            placeholder="If you decline: what should they change?"
            aria-label="Reason, if declining"
            className="min-h-[44px] rounded-control border border-line px-3 text-base text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none sm:text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => decide(r.campaignId, true)} disabled={busy !== null} className="tap min-h-[44px] rounded-control bg-teal px-4 text-sm font-bold text-white disabled:opacity-60">
              {busy === r.campaignId ? "Saving..." : "Approve, start today"}
            </button>
            <button type="button" onClick={() => decide(r.campaignId, false)} disabled={busy !== null} className="tap min-h-[44px] rounded-control border border-line px-4 text-sm font-bold text-ink disabled:opacity-60">
              Decline with the reason
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
