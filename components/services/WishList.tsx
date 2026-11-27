"use client";

// "Asked for a time" (round 4, S2, decision 5): customers for whom nothing
// fitted, with the days and part of the day they want. The owner answers
// from their own WhatsApp, then marks it answered.

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface WishView {
  id: string;
  name: string;
  phone: string;
  service: string | null;
  person: string | null;
  when: string;
  note: string | null;
  askedAt: string;
}

export default function WishList({ businessId, businessName, wishes }: { businessId: string; businessName: string; wishes: WishView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mark(id: string, status: "answered" | "closed") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/services/booking-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, action: "answer_wish", wishId: id, status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "That did not save. Tap again.");
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Tap again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {wishes.map((w) => {
        const first = w.name.split(/\s+/)[0];
        const text = `Hello ${first}, this is ${businessName}. You asked for ${w.when}${w.service ? ` for ${w.service}` : ""}. A time has opened up: `;
        return (
          <div key={w.id} className="flex flex-col gap-1 border-t border-neutral-100 pt-2.5 first:border-t-0 first:pt-0">
            <strong className="text-[13.5px] text-ink">{w.name}</strong>
            <span className="text-xs text-neutral-600">
              {[w.service, w.person ? `with ${w.person}` : null, w.when].filter(Boolean).join(", ")}
            </span>
            {w.note && <span className="text-xs text-neutral-700">&ldquo;{w.note}&rdquo;</span>}
            <span className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={`https://wa.me/${w.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex min-h-[40px] items-center rounded-control bg-teal px-3.5 text-[13px] font-bold text-white"
              >
                WhatsApp {first}
              </a>
              <button type="button" disabled={busy === w.id} onClick={() => mark(w.id, "answered")} className="tap min-h-[40px] px-2 text-[13px] font-semibold text-teal-700">
                Answered
              </button>
              <button type="button" disabled={busy === w.id} onClick={() => mark(w.id, "closed")} className="tap min-h-[40px] px-2 text-[13px] font-semibold text-neutral-600">
                Close
              </button>
            </span>
          </div>
        );
      })}
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
