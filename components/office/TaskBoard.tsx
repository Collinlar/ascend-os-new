"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardTask } from "@/lib/office/load";
import { Avatar, StatusPill, Tag, type Tone } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import { Toast, useToast } from "@/components/shell/Toast";
import { TaskForm, type TeamOption } from "./OfficeForms";
import { useOfficeAction } from "./useOfficeAction";

// The Work board (Modules M2): To do, In progress, Waiting and Done this
// week, filtered by job and by person. Every card says what it belongs to,
// when it is due, and who has it, and moves with one tap (0139).

type Column = "open" | "in_progress" | "blocked" | "done";

const COLUMNS: Array<{ key: Column; label: string }> = [
  { key: "open", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Waiting" },
  { key: "done", label: "Done this week" },
];

// Where a card can go from each column, in the words a person would use.
const MOVES: Record<Column, Array<{ to: Column; label: string }>> = {
  open: [
    { to: "in_progress", label: "Start" },
    { to: "done", label: "Done" },
  ],
  in_progress: [
    { to: "blocked", label: "Waiting" },
    { to: "done", label: "Done" },
  ],
  blocked: [
    { to: "in_progress", label: "Back on it" },
    { to: "done", label: "Done" },
  ],
  done: [{ to: "open", label: "Reopen" }],
};

const SOURCE: Record<string, string> = {
  shop_order: "Shop order",
  service_booking: "Booking",
  document: "Document",
  sale: "Sale",
  pos_shift: "Till shift",
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short" });
}

function accraDay(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
}

function duePill(t: BoardTask): { text: string; tone: Tone } | null {
  if (t.status === "done") return t.doneAt ? { text: `Done ${day(t.doneAt)}`, tone: "ok" } : null;
  if (!t.dueAt) return null;
  const due = new Date(t.dueAt);
  const today = accraDay(new Date());
  const dueDay = accraDay(due);
  if (dueDay === today) return { text: due.getTime() < Date.now() ? "Due earlier today" : "Due today", tone: "warn" };
  if (dueDay < today) {
    const days = Math.max(1, Math.round((new Date(today).getTime() - new Date(dueDay).getTime()) / 864e5));
    return { text: `Overdue ${days} day${days === 1 ? "" : "s"}`, tone: "bad" };
  }
  return { text: `Due ${day(t.dueAt)}`, tone: "mute" };
}

export default function TaskBoard({
  tasks,
  team,
  me,
  runsThePlace,
  canAdd,
  startAdding = false,
}: {
  tasks: BoardTask[];
  team: TeamOption[];
  /** This person's membership, for "Mine". */
  me: string;
  runsThePlace: boolean;
  /** The business can make new work (office.work or work.core). */
  canAdd: boolean;
  /** Opened from "New task" in the module bar (?new=task). */
  startAdding?: boolean;
}) {
  const router = useRouter();
  const { run, busy, error } = useOfficeAction();
  const toast = useToast();
  const [job, setJob] = useState<string>("all");
  const [person, setPerson] = useState<string>("anyone");
  const [phoneCol, setPhoneCol] = useState<Column>("open");
  const [adding, setAdding] = useState(startAdding);
  useEffect(() => {
    if (!startAdding) return;
    setAdding(true);
    router.replace("/work/board", { scroll: false });
  }, [startAdding, router]);

  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) if (t.projectId && t.projectName) m.set(t.projectId, t.projectName);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [tasks]);
  const loose = tasks.some((t) => !t.projectId);

  const shown = tasks.filter(
    (t) =>
      (job === "all" || (job === "none" ? !t.projectId : t.projectId === job)) &&
      (person === "anyone" || (person === "nobody" ? !t.assigneeId : t.assigneeId === person))
  );

  const SAID: Record<Column, string> = {
    open: "Back in To do",
    in_progress: "Started",
    blocked: "Moved to Waiting",
    done: "Done",
  };
  async function move(t: BoardTask, to: Column) {
    const ok = await run(t.id, { action: "move_task", taskId: t.id, status: to });
    if (ok) toast.show(`${SAID[to]}: ${t.title}`);
  }

  const chip = (on: boolean) =>
    `tap flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${
      on ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" aria-pressed={job === "all"} onClick={() => setJob("all")} className={chip(job === "all")}>
            All work <span className="num text-[11.5px] font-bold">{tasks.filter((t) => t.status !== "done").length}</span>
          </button>
          {jobs.map((j) => (
            <button key={j.id} type="button" aria-pressed={job === j.id} onClick={() => setJob(j.id)} className={chip(job === j.id)}>
              {j.name}
            </button>
          ))}
          {loose && jobs.length > 0 && (
            <button type="button" aria-pressed={job === "none"} onClick={() => setJob("none")} className={chip(job === "none")}>
              Not part of a job
            </button>
          )}
        </div>
        {runsThePlace && team.length > 1 && (
          <label className="flex flex-none items-center gap-2 text-[12.5px] font-semibold text-neutral-600">
            <Icon name="users" size={16} />
            <span className="sr-only">Whose work</span>
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="min-h-[40px] rounded-full border-[1.5px] border-neutral-200 bg-white px-3 text-[13px] font-semibold text-ink focus:border-teal focus:outline-none"
            >
              <option value="anyone">Anyone</option>
              <option value={me}>Mine</option>
              <option value="nobody">Not given to anyone</option>
              {team
                .filter((m) => m.membershipId !== me)
                .map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-panel bg-danger-tint px-4 py-3 text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
      {adding && (
        <TaskForm
          team={team}
          onDone={(m) => {
            setAdding(false);
            toast.show(m);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* On a phone, one column at a time. */}
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Columns">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={phoneCol === c.key}
            onClick={() => setPhoneCol(c.key)}
            className={`tap flex h-11 flex-none items-center gap-1.5 whitespace-nowrap border-b-[2.5px] px-3 text-sm ${
              phoneCol === c.key ? "border-teal font-bold text-teal-800" : "border-transparent font-medium text-neutral-600"
            }`}
          >
            {c.label}
            <span className="num text-xs">{shown.filter((t) => t.status === c.key).length}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-4">
        {COLUMNS.map((c) => {
          const cards = shown.filter((t) => t.status === c.key);
          return (
            <section
              key={c.key}
              aria-label={c.label}
              className={`flex-col gap-2.5 rounded-[18px] bg-neutral-100 p-2.5 ${phoneCol === c.key ? "flex" : "hidden lg:flex"}`}
            >
              <div className="flex items-center justify-between px-1.5 pt-0.5">
                <h2 className="text-[13.5px] font-bold text-ink">{c.label}</h2>
                <StatusPill tone="mute">{cards.length}</StatusPill>
              </div>
              {cards.length === 0 && (
                <p className="px-1.5 pb-1 text-[12.5px] text-neutral-600">
                  {c.key === "open" ? "Nothing waiting to start." : c.key === "in_progress" ? "Nobody is on anything right now." : c.key === "blocked" ? "Nothing stuck on someone else." : "Nothing finished this week yet."}
                </p>
              )}
              {cards.map((t) => {
                const pill = duePill(t);
                const theirs = runsThePlace || !t.assigneeId || t.assigneeId === me;
                return (
                  <article key={t.id} className="flex flex-col gap-2 rounded-[14px] border border-line-brand bg-white px-3 py-2.5">
                    {(t.projectName || (t.sourceType && SOURCE[t.sourceType])) && (
                      <span className="flex flex-wrap gap-1">
                        {t.projectName && <Tag>{t.projectName}</Tag>}
                        {t.sourceType && SOURCE[t.sourceType] && <Tag>From a {SOURCE[t.sourceType].toLowerCase()}</Tag>}
                      </span>
                    )}
                    <span className="text-[13.5px] font-semibold leading-snug text-ink">{t.title}</span>
                    {t.detail && <span className="line-clamp-2 text-xs text-neutral-600">{t.detail}</span>}
                    <span className="flex items-center justify-between gap-2">
                      {pill ? <StatusPill tone={pill.tone}>{pill.text}</StatusPill> : <span />}
                      {t.assigneeName ? (
                        <span className="flex items-center gap-1.5" title={t.assigneeName}>
                          <span className="sr-only">With {t.assigneeName}</span>
                          <Avatar name={t.assigneeName} size={26} />
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">Anyone</span>
                      )}
                    </span>
                    {theirs && (
                      <span className="flex gap-1.5 border-t border-neutral-100 pt-2">
                        {MOVES[c.key].map((m) => (
                          <button
                            key={m.to}
                            type="button"
                            onClick={() => move(t, m.to)}
                            disabled={busy === t.id}
                            className="tap flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] border border-line-brand px-2 text-[12.5px] font-bold text-teal-800 hover:border-teal-brand disabled:opacity-60"
                          >
                            {busy === t.id ? "Moving..." : m.label}
                          </button>
                        ))}
                      </span>
                    )}
                  </article>
                );
              })}
              {c.key === "open" && canAdd && !adding && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="tap flex min-h-[44px] items-center gap-1.5 rounded-[12px] px-2 text-[13px] font-semibold text-teal-800 hover:bg-white"
                >
                  <Icon name="plus" size={16} />
                  Add task
                </button>
              )}
            </section>
          );
        })}
      </div>
      <Toast message={toast.message} />
    </div>
  );
}
