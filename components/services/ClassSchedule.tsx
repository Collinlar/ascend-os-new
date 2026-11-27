"use client";

// Classes (round 4, S3, decision 3): what is scheduled for each class
// service with seats booked, schedule another, or cancel one.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";

export interface ClassRow {
  id: string;
  itemId: string;
  startsAt: string;
  seats: number;
  seatsLeft: number;
  place: string | null;
  teacher: string | null;
}

const ACCRA = "Africa/Accra";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ClassSchedule({
  businessId,
  services,
  classes,
  places,
  team,
}: {
  businessId: string;
  services: Array<{ id: string; name: string }>;
  classes: ClassRow[];
  places: Array<{ id: string; name: string }>;
  team: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:00");
  const [seats, setSeats] = useState("8");
  const [placeId, setPlaceId] = useState(places[0]?.id ?? "");
  const [teacher, setTeacher] = useState(team[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [sure, setSure] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setNote(null);
    try {
      const res = await fetch("/api/services/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({ ok: false, text: data.error ?? "That did not save. Tap again." });
        return null;
      }
      return data;
    } catch {
      setNote({ ok: false, text: "We could not reach Ascend just now. Tap again." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const input = "min-h-[44px] rounded-control border border-line bg-white px-3 text-base text-ink focus:border-teal focus:outline-none sm:text-sm";
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <h2 className="font-heading text-base font-bold text-ink-heading">Classes</h2>
      {classes.length === 0 ? (
        <p className="text-[13px] text-neutral-600">No classes scheduled. Customers see a class on your booking page once you add one.</p>
      ) : (
        <div className="flex flex-col">
          {classes.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5 border-t border-neutral-100 py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-col">
                <strong className="text-[13.5px] text-ink">
                  {services.find((s) => s.id === c.itemId)?.name ?? "Class"} · {when(c.startsAt)}
                </strong>
                <span className="text-[12.5px] text-neutral-600">
                  {[c.place, c.teacher ? `with ${c.teacher}` : null, `${c.seats - c.seatsLeft} of ${c.seats} seats booked`].filter(Boolean).join(" · ")}
                </span>
              </span>
              {sure === c.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] text-neutral-700">Cancel it and every seat booked?</span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      const r = await call({ action: "cancel", classId: c.id }, c.id);
                      if (r) {
                        setSure(null);
                        setNote({ ok: true, text: r.cancelled ? `Cancelled, with ${r.cancelled} booking${r.cancelled === 1 ? "" : "s"}. Tell them from each booking.` : "Cancelled." });
                        router.refresh();
                      }
                    }}
                    className="tap min-h-[40px] rounded-control bg-danger-ink px-3 text-[13px] font-bold text-white"
                  >
                    {busy === c.id ? "Cancelling" : "Yes, cancel the class"}
                  </button>
                  <button type="button" onClick={() => setSure(null)} className="tap min-h-[40px] px-2 text-[13px] font-semibold text-neutral-700">
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setSure(c.id)} className="tap min-h-[40px] self-start px-1 text-[13px] font-semibold text-danger-ink">
                  Cancel class
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2.5 border-t border-neutral-100 pt-3">
        <strong className="text-[13.5px] text-ink">Schedule a class</strong>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {services.length > 1 && (
            <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
              Class
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={input}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
            Day
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
            Starts at
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
            Seats
            <input inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} className={input} />
          </label>
          {places.length > 1 && (
            <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
              Where
              <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={input}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {team.length > 0 && (
            <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
              Who teaches
              <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className={input}>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={busy !== null || !date || !time || !itemId}
          onClick={async () => {
            // Times are Accra's, which is UTC all year.
            const r = await call({ action: "schedule", itemId, startsAt: `${date}T${time}:00+00:00`, seats: Number(seats), locationId: placeId, membershipId: teacher }, "new");
            if (r) {
              setNote({ ok: true, text: "Scheduled. It is on your booking page now." });
              setDate("");
              router.refresh();
            }
          }}
          className={`${secondaryAction} min-h-[44px] self-start disabled:opacity-50`}
        >
          {busy === "new" ? "Scheduling" : "Schedule this class"}
        </button>
      </div>
      {note && <p role={note.ok ? "status" : "alert"} className={`text-[13px] ${note.ok ? "text-success-ink" : "text-danger-ink"}`}>{note.text}</p>}
    </section>
  );
}
