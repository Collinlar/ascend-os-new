import type { ScheduleEntry } from "@/lib/office/schedule";

// What is coming, grouped by day (Office PRD 25).
//
// One list, not a grid. Bookings, absences, job deadlines and due work
// interleaved in date order is the answer to "what is happening this week".
// A month grid at 375px shows numbers, not answers.

const KIND_LABEL: Record<string, string> = {
  booking: "Booking",
  leave: "Off work",
  job: "Job",
  task: "To do",
};

// The one that should catch the eye is somebody being away, because it is
// the one that changes what everybody else has to do.
const KIND_TONE: Record<string, string> = {
  booking: "bg-teal-light text-teal-dark",
  leave: "bg-gold-tint text-gold-ink",
  job: "bg-light-grey text-ink-slate",
  task: "bg-light-grey text-ink-slate",
};

export default function Schedule({ entries }: { entries: ScheduleEntry[] }) {
  if (entries.length === 0) {
    return (
      <section>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
          What is coming
        </h2>
        <p className="mt-2 rounded-panel border border-line-soft bg-white px-[18px] py-3.5 text-[13px] font-medium text-slate-grey">
          Nothing booked or due in the next two weeks.
        </p>
      </section>
    );
  }

  const byDay = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const day = entry.at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(entry);
  }

  return (
    <section>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
        What is coming
      </h2>
      <div className="mt-2 space-y-2.5">
        {Array.from(byDay.entries()).map(([day, items]) => (
          <div
            key={day}
            className="overflow-hidden rounded-panel border border-line-soft bg-white"
          >
            <p className="border-b border-line-soft px-[18px] py-2 text-[12px] font-bold text-ink">
              {dayLabel(day)}
            </p>
            <div className="divide-y divide-line-soft">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-2.5"
                >
                  <span
                    className={`flex-none rounded-full px-2.5 py-[2px] text-[11px] font-extrabold ${
                      KIND_TONE[item.kind]
                    }`}
                  >
                    {KIND_LABEL[item.kind]}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium text-ink">
                    {item.title}
                    {item.who && (
                      <span className="text-slate-grey"> · {item.who}</span>
                    )}
                  </span>
                  {item.timed && (
                    <span className="num flex-none text-[12px] font-bold text-slate-grey">
                      {clock(item.at)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  const today = new Date();
  const diff = Math.round(
    (date.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 864e5
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  });
}
