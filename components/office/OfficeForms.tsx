"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { OfficeModules } from "@/lib/office/access";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon, type IconName } from "@/components/shell/icons";
import { Toast, useToast } from "@/components/shell/Toast";
import { fieldClass, useOfficeAction } from "./useOfficeAction";

// The things a person starts from Office (Modules M2): add a task, start a
// job, record money spent, ask to buy something, ask for days off, and check
// in or out. Lifted out of the old Work page so Today and the board offer
// the same forms, each one open at a time.

export interface TeamOption {
  membershipId: string;
  name: string;
}

type Done = (message: string) => void;

function FormShell({
  title,
  children,
  error,
  submit,
  busyLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  error: string | null;
  submit: string;
  busyLabel: string;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-line-brand bg-white p-4">
      <p className="font-heading text-[15px] font-bold text-ink-heading">{title}</p>
      {children}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSubmit} disabled={busy} className={`${primaryAction} disabled:opacity-60`}>
          {busy ? busyLabel : submit}
        </button>
        <button type="button" onClick={onCancel} className={secondaryAction}>
          Not now
        </button>
      </div>
    </div>
  );
}

export function TaskForm({ team, onDone, onCancel }: { team: TeamOption[]; onDone: Done; onCancel: () => void }) {
  const { run, busy, error, setError } = useOfficeAction();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  async function submit() {
    if (title.trim().length < 2) return setError("Say what needs doing.");
    const ok = await run("task", {
      action: "create_task",
      title,
      detail,
      assigneeMembershipId: who || undefined,
      // A date with no time means the end of that working day, which is what
      // a person means by "by Friday".
      dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : undefined,
    });
    if (ok) onDone("Added to To do.");
  }
  return (
    <FormShell title="Add a task" error={error} submit="Add it to To do" busyLabel="Adding it..." busy={busy === "task"} onSubmit={submit} onCancel={onCancel}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" aria-label="What needs doing" className={fieldClass} />
      <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Anything else worth knowing" aria-label="Task detail" className={fieldClass} />
      <div className="grid gap-2 sm:grid-cols-2">
        {/* Unassigned is allowed and common: a small team picks work up
            rather than being handed it. */}
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who should do it" className={fieldClass}>
          <option value="">Anyone on the team</option>
          {team.map((m) => (
            <option key={m.membershipId} value={m.membershipId}>
              {m.name}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="When it is needed by" className={fieldClass} />
      </div>
    </FormShell>
  );
}

export function ProjectForm({ onDone, onCancel }: { onDone: Done; onCancel: () => void }) {
  const { run, busy, error, setError } = useOfficeAction();
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [steps, setSteps] = useState("");
  async function submit() {
    if (name.trim().length < 2) return setError("Give the job a name.");
    const ok = await run("project", {
      action: "create_project",
      name,
      dueOn: due || undefined,
      // One step per line, which is how somebody writes a list when nobody
      // has given them a form for it.
      milestones: steps
        .split(/\r?\n/)
        .map((line) => ({ title: line.trim() }))
        .filter((m) => m.title),
    });
    if (ok) onDone("Job started. Its tasks show on the board.");
  }
  return (
    <FormShell title="Start a job" error={error} submit="Save the job" busyLabel="Saving the job..." busy={busy === "project"} onSubmit={submit} onCancel={onCancel}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What is the job? A refit, a wedding, a launch" aria-label="Job name" className={fieldClass} />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="When the job is due" className={fieldClass} />
      <textarea
        value={steps}
        onChange={(e) => setSteps(e.target.value)}
        rows={4}
        placeholder={"The steps, one per line\nBook the venue\nConfirm the menu\nDeliver"}
        aria-label="Steps, one per line"
        className={fieldClass}
      />
    </FormShell>
  );
}

export function ExpenseForm({ onDone, onCancel }: { onDone: Done; onCancel: () => void }) {
  const { run, busy, error, setError } = useOfficeAction();
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  async function submit() {
    const value = parseFloat(amount);
    if (!(value > 0) || detail.trim().length < 2) return setError("Say how much was spent and what it was for.");
    const data = await run("expense", { action: "submit_expense", amount: value, detail: detail.trim() });
    if (data) onDone(data.needsApproval ? "Recorded. It waits for approval before it counts as a cost." : "Recorded.");
  }
  return (
    <FormShell title="Record money spent" error={error} submit="Record it" busyLabel="Recording it..." busy={busy === "expense"} onSubmit={submit} onCancel={onCancel}>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="How much, in GHS?" aria-label="Amount in GHS" className={fieldClass} />
      <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What was it for? Transport, fuel, cleaning" aria-label="What it was for" className={fieldClass} />
      <p className="text-[12.5px] text-neutral-500">Above your business&apos;s limit it goes for approval first.</p>
    </FormShell>
  );
}

export function BuyForm({ onDone, onCancel }: { onDone: Done; onCancel: () => void }) {
  const { run, busy, error, setError } = useOfficeAction();
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  async function submit() {
    if (what.trim().length < 3 || !(parseFloat(amount) > 0)) return setError("Say what you need and roughly what it costs.");
    const ok = await run("buy", { action: "request_purchase", detail: what, amount: parseFloat(amount), supplier: from });
    if (ok)
      onDone(from.trim() ? "Asked. Once it is agreed, a purchase order goes to them." : "Asked. Name a supplier next time and the order is raised too.");
  }
  return (
    <FormShell title="Ask to buy something" error={error} submit="Ask to buy it" busyLabel="Asking..." busy={busy === "buy"} onSubmit={submit} onCancel={onCancel}>
      <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What do you need?" aria-label="What you need to buy" className={fieldClass} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Roughly how much, in GHS?" aria-label="Rough cost in GHS" className={fieldClass} />
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Who from?" aria-label="Supplier" className={fieldClass} />
      </div>
    </FormShell>
  );
}

export function LeaveForm({ onDone, onCancel }: { onDone: Done; onCancel: () => void }) {
  const { run, busy, error, setError } = useOfficeAction();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  async function submit() {
    if (!from || !to) return setError("Say which days you need off.");
    const ok = await run("leave", {
      action: "request_leave",
      // A day off means the whole day, so the range covers both ends.
      startsAt: new Date(`${from}T00:00:00`).toISOString(),
      endsAt: new Date(`${to}T23:59:59`).toISOString(),
      detail: why,
    });
    if (ok) onDone("Asked. Your manager decides it.");
  }
  return (
    <FormShell title="Ask for days off" error={error} submit="Ask for these days" busyLabel="Asking..." busy={busy === "leave"} onSubmit={submit} onCancel={onCancel}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          First day
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          Last day
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why, if you want to say" aria-label="Reason" className={fieldClass} />
    </FormShell>
  );
}

export function AttendanceButton({ checkedIn, compact = false }: { checkedIn: boolean; compact?: boolean }) {
  const { run, busy, error } = useOfficeAction();
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => run("attendance", { action: "attendance" })}
        disabled={busy === "attendance"}
        className={`${checkedIn ? secondaryAction : primaryAction} ${compact ? "min-h-[40px]" : ""} disabled:opacity-60`}
      >
        {busy === "attendance" ? (checkedIn ? "Checking you out..." : "Checking you in...") : checkedIn ? "Check out" : "Check in"}
      </button>
      {error && (
        <span role="alert" className="text-xs font-semibold text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}

type FormKey = "task" | "project" | "expense" | "buy" | "leave";

const SHORTCUT: Record<FormKey, { label: string; icon: IconName }> = {
  task: { label: "Add a task", icon: "plus" },
  project: { label: "Start a job", icon: "briefcase" },
  expense: { label: "Record money spent", icon: "money" },
  buy: { label: "Ask to buy something", icon: "box" },
  leave: { label: "Ask for days off", icon: "calendar" },
};

/**
 * The starting points this person has, one form open at a time. `open`
 * lets the top bar's primary action arrive already open (?new=task).
 */
export function Shortcuts({
  modules,
  runsThePlace,
  team,
  open: openFirst = null,
  cleanHref,
}: {
  modules: OfficeModules;
  runsThePlace: boolean;
  team: TeamOption[];
  open?: FormKey | null;
  /** Where to send the address once a ?new= form has opened. */
  cleanHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<FormKey | null>(openFirst);
  const toast = useToast();
  useEffect(() => {
    if (!openFirst) return;
    setOpen(openFirst);
    if (cleanHref) router.replace(cleanHref, { scroll: false });
  }, [openFirst, cleanHref, router]);

  const keys: FormKey[] = [];
  if (modules.projects) keys.push("task");
  if (modules.projects && runsThePlace) keys.push("project");
  if (modules.expenses) keys.push("expense");
  if (modules.purchases) keys.push("buy");
  if (modules.leave) keys.push("leave");
  if (keys.length === 0) return null;

  const done = (message: string) => {
    setOpen(null);
    toast.show(message);
  };
  const cancel = () => setOpen(null);

  return (
    <section aria-labelledby="start" className="flex flex-col gap-2.5 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <h2 id="start" className="font-heading text-base font-bold text-ink-heading">
        Start something
      </h2>
      {open === "task" && <TaskForm team={team} onDone={done} onCancel={cancel} />}
      {open === "project" && <ProjectForm onDone={done} onCancel={cancel} />}
      {open === "expense" && <ExpenseForm onDone={done} onCancel={cancel} />}
      {open === "buy" && <BuyForm onDone={done} onCancel={cancel} />}
      {open === "leave" && <LeaveForm onDone={done} onCancel={cancel} />}
      <div className="grid grid-cols-1 gap-2">
        {keys
          .filter((k) => k !== open)
          .map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setOpen(k)}
              className="tap flex min-h-[44px] items-center gap-2.5 rounded-control border border-neutral-200 bg-white px-3.5 text-left text-[13.5px] font-semibold text-ink hover:border-teal-brand"
            >
              <span className="text-teal-700">
                <Icon name={SHORTCUT[k].icon} size={17} />
              </span>
              {SHORTCUT[k].label}
            </button>
          ))}
      </div>
      <Toast message={toast.message} />
    </section>
  );
}
