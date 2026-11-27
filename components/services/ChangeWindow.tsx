"use client";

// How long before a booking customers can still change or cancel it
// themselves (round 4, S2, decision 1). Inside it, they message you.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";

const CHOICES: Array<[number, string]> = [
  [0, "Up to the start"],
  [2, "2 hours before"],
  [12, "12 hours before"],
  [24, "24 hours before"],
  [48, "2 days before"],
  [72, "3 days before"],
  [168, "A week before"],
];

export default function ChangeWindow({ businessId, hours }: { businessId: string; hours: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(hours ?? 24);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const choices = CHOICES.some(([h]) => h === value) ? CHOICES : [...CHOICES, [value, `${value} hours before`] as [number, string]];

  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <h2 className="font-heading text-base font-bold text-ink-heading">Changes and cancellations</h2>
      <p className="text-[13px] leading-relaxed text-neutral-700">
        Customers can move or cancel a booking from their booking link until this point. After it, they message you. A cancelled deposit is yours to return.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
            setNote(null);
          }}
          aria-label="Free changes until"
          disabled={hours === null}
          className="min-h-[44px] rounded-control border border-line bg-white px-3 text-[14px] text-ink disabled:opacity-50"
        >
          {choices.map(([h, l]) => (
            <option key={h} value={h}>
              Free changes until {l.toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || hours === null || value === hours}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              const res = await fetch("/api/services/booking-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, action: "set_window", hours: value }) });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) return setNote({ ok: false, text: data.error ?? "That did not save. Tap again." });
              setNote({ ok: true, text: "Saved. New and existing bookings follow it." });
              router.refresh();
            } catch {
              setNote({ ok: false, text: "We could not reach Ascend just now. Tap again." });
            } finally {
              setBusy(false);
            }
          }}
          className={`${secondaryAction} min-h-[44px] disabled:opacity-50`}
        >
          {busy ? "Saving" : "Save the rule"}
        </button>
      </div>
      {hours === null && <p className="text-[12.5px] text-neutral-600">This switches on after this week&apos;s update.</p>}
      {note && <p role={note.ok ? "status" : "alert"} className={`text-[13px] ${note.ok ? "text-success-ink" : "text-danger-ink"}`}>{note.text}</p>}
    </section>
  );
}
