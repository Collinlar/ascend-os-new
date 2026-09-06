import type { CommandCentre } from "@/lib/office/command-centre";
import { formatGHS } from "@/lib/money";

// The top of the Office screen: what is late, what is due, who is here, and
// what the team has just done (Office PRD 13).
//
// Server-rendered on purpose. None of it is interactive, and a merchant on
// a slow connection should not wait on JavaScript to be told three numbers.

function Counter({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "plain" | "warn";
}) {
  return (
    <div
      className={`rounded-panel border px-[18px] py-4 ${
        tone === "warn" && value > 0
          ? "border-gold-rule bg-gold-tint"
          : "border-line-soft bg-white"
      }`}
    >
      <p
        className={`num text-2xl font-extrabold tracking-[-0.02em] ${
          tone === "warn" && value > 0 ? "text-gold-ink" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p
        className={`mt-0.5 text-[12.5px] font-semibold ${
          tone === "warn" && value > 0 ? "text-gold-ink" : "text-slate-grey"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

export default function CommandCentreView({
  data,
  approvalsWaiting,
}: {
  data: CommandCentre;
  approvalsWaiting: number;
}) {
  const { pulse } = data;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-2.5">
        <Counter value={data.atRisk} label="Past due" tone="warn" />
        <Counter value={data.dueToday} label="Due today" tone="plain" />
        <Counter value={approvalsWaiting} label="Waiting on you" tone="plain" />
      </section>

      {/* Who is actually at work. The one thing an owner away from the shop
          cannot otherwise find out. */}
      <section>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
          Team today
        </h2>
        {data.teamToday.length === 0 ? (
          <p className="mt-2 rounded-panel border border-line-soft bg-white px-[18px] py-3.5 text-[13px] font-medium text-slate-grey">
            Nobody is checked in right now.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.teamToday.map((m) => (
              <span
                key={m.membershipId}
                className="flex items-center gap-2 rounded-chip border border-line-soft bg-white px-3.5 py-2"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 flex-none rounded-full bg-teal"
                />
                <span className="text-[13px] font-bold text-ink">{m.name}</span>
                <span className="text-[12px] font-medium text-slate-grey">
                  since {clock(m.since)}
                  {m.fromTill && " · till"}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* The shop floor, from Office. An owner away from the counter should
          not have to open POS to find out whether anyone is selling. */}
      {data.openShifts.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
            Selling now
          </h2>
          <div className="mt-2 divide-y divide-line-soft rounded-panel border border-line-soft bg-white">
            {data.openShifts.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3"
              >
                <p className="text-[13.5px] font-bold text-ink">
                  {s.cashier}
                  {s.locationName && (
                    <span className="font-medium text-slate-grey">
                      {" "}
                      · {s.locationName}
                    </span>
                  )}
                </p>
                <p className="text-[12px] font-medium text-slate-grey">
                  till open since {clock(s.openedAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Business Pulse (Office PRD 28). Five facts about the week, not a
          chart: an owner wants to know whether the place ran, not to
          interpret a graph on a 375px screen. */}
      <section className="rounded-panel border border-line-soft bg-white px-[22px] py-[17px] shadow-card">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
          This week
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          <Fact label="Jobs finished" value={String(pulse.tasksDone7d)} />
          <Fact label="Still open" value={String(pulse.tasksOpen)} />
          <Fact label="Hours worked" value={`${pulse.hoursWorked7d}`} />
          <Fact label="Spent by the team" value={formatGHS(pulse.spend7d)} />
        </dl>
      </section>

      {data.activity.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
            Recently
          </h2>
          <div className="mt-2 divide-y divide-line-soft rounded-panel border border-line-soft bg-white">
            {data.activity.map((item) => (
              <div key={item.id} className="px-[18px] py-3">
                <p className="text-[13.5px] font-medium text-ink">
                  {item.who && (
                    <span className="font-bold">{item.who} </span>
                  )}
                  {item.who ? lower(item.what) : item.what}
                </p>
                <p className="text-[12px] font-medium text-slate-grey">
                  {ago(item.at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-slate-grey">{label}</dt>
      <dd className="num mt-0.5 text-[17px] font-extrabold tracking-[-0.01em] text-ink">
        {value}
      </dd>
    </div>
  );
}

// "Ama recorded 40.00" rather than "Ama Recorded 40.00".
function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
