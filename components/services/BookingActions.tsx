"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { primaryAction, secondaryAction } from "@/components/shell/Page";

// What can be done to one booking from its page (Modules M4): give it to
// someone, move it on (accept, start, done, did not come), or cancel it
// with a reason. The database decides which moves are allowed (0018).

const NEXT: Record<string, Array<{ to: string; label: string; primary?: boolean }>> = {
  requested: [{ to: "confirmed", label: "Accept this booking", primary: true }],
  quoted: [{ to: "confirmed", label: "Accept this booking", primary: true }],
  confirmed: [
    { to: "in_progress", label: "Start it", primary: true },
    { to: "no_show", label: "They did not come" },
  ],
  in_progress: [{ to: "completed", label: "Mark it done", primary: true }],
};

export default function BookingActions({
  bookingId,
  status,
  providerId,
  team,
}: {
  bookingId: string;
  status: string;
  providerId: string | null;
  team: Array<{ membershipId: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  async function call(key: string, url: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "That did not go through. Tap again.");
      else router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(null);
    }
  }

  const open = ["requested", "quoted", "confirmed", "in_progress"].includes(status);
  if (!open) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {team.length > 1 && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          Who does it
          <select
            value={providerId ?? ""}
            disabled={busy !== null}
            onChange={(e) => e.target.value && call("assign", "/api/office/actions", { action: "assign_booking", bookingId, membershipId: e.target.value })}
            className="min-h-[44px] rounded-control border-[1.5px] border-neutral-200 bg-white px-3 text-base text-ink focus:border-teal focus:outline-none"
          >
            <option value="">Pick someone</option>
            {team.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(NEXT[status] ?? []).map((n) => (
        <button
          key={n.to}
          type="button"
          disabled={busy !== null}
          onClick={() => call(n.to, `/api/services/bookings/${bookingId}`, { toStatus: n.to })}
          className={`${n.primary ? primaryAction : secondaryAction} min-h-[40px] justify-center disabled:opacity-60`}
        >
          {busy === n.to ? "Saving..." : n.label}
        </button>
      ))}
      {!cancelling ? (
        <button type="button" onClick={() => setCancelling(true)} className={`${secondaryAction} min-h-[40px] justify-center`}>
          Cancel this booking
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-panel border border-line-brand p-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it cancelled?"
            aria-label="Why it is cancelled"
            className="min-h-[44px] rounded-control border-[1.5px] border-neutral-200 px-3 text-base text-ink focus:border-teal focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => call("cancel", `/api/services/bookings/${bookingId}`, { toStatus: "cancelled", reason })}
              className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}
            >
              {busy === "cancel" ? "Cancelling..." : "Cancel it"}
            </button>
            <button type="button" onClick={() => setCancelling(false)} className={secondaryAction}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
