"use client";

// Pause or resume one campaign (round 3, P1). Paused days are not charged.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CampaignToggle({ campaignId, paused }: { campaignId: string; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discover/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: paused ? "resume_campaign" : "pause_campaign", campaignId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) setError(out.error ?? "That did not go through. Tap again.");
      else router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col">
      <button
        type="button"
        onClick={flip}
        disabled={busy}
        className="tap min-h-[36px] rounded-control px-2 text-[12.5px] font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
      >
        {busy ? (paused ? "Resuming..." : "Pausing...") : paused ? "Resume" : "Pause"}
      </button>
      {error && (
        <span role="alert" className="text-[11.5px] font-semibold text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}
