"use client";

import { useMemo, useRef, useState } from "react";
import { formatGHS } from "@/lib/money";
import type { ApprovalItem } from "@/lib/office/load";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { StatusPill, Timeline, type Tone } from "@/components/shell/Parts";
import { Icon, type IconName } from "@/components/shell/icons";
import { Toast, useToast } from "@/components/shell/Toast";
import { fieldClass, useOfficeAction } from "./useOfficeAction";

// Approvals (Modules M2): what is waiting on a decision, one at a time, with
// what the decider needs beside it: who asked and why, the rule that sent it
// here, what it is tied to, and what has happened to it so far.

const KIND: Record<string, { label: string; icon: IconName }> = {
  expense: { label: "Money spent", icon: "money" },
  refund: { label: "Refund", icon: "swap" },
  discount: { label: "Discount", icon: "tag" },
  purchase: { label: "Purchase", icon: "box" },
  leave: { label: "Time off", icon: "calendar" },
  void: { label: "Cancelled sale", icon: "close" },
};

const ROLE: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  accountant: "Accountant",
  staff: "Staff",
};

const STATE: Record<string, { text: string; tone: Tone }> = {
  requested: { text: "Waiting", tone: "warn" },
  approved: { text: "Approved", tone: "ok" },
  rejected: { text: "Turned down", tone: "bad" },
  cancelled: { text: "Withdrawn", tone: "mute" },
};

function dayOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short" });
}

/** "3 Dec to 4 Dec", or one day. */
function daysText(d: { from: string; to: string }): string {
  const a = dayOnly(d.from), b = dayOnly(d.to);
  return a === b ? a : `${a} to ${b}`;
}

const kindOf = (k: string) => KIND[k] ?? { label: k, icon: "alert" as IconName };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Why this one came to a decider, in the business's own terms. */
function whyItNeedsYou(a: ApprovalItem): string {
  switch (a.kind) {
    case "refund":
      return "Money going back to a customer needs a manager's yes before the till pays it out.";
    case "discount":
      return "This discount is more than the till lets a cashier give on their own.";
    case "void":
      return "Cancelling a finished sale changes the day's takings, so a manager decides it.";
    case "expense":
      return a.ruleAbove !== null && a.ruleAbove > 0
        ? `Your rule: spending above ${formatGHS(a.ruleAbove)} waits for approval before it counts as a cost.`
        : "Your business asks for approval before spending counts as a cost.";
    case "purchase":
      return "Buying waits for a yes. Once you agree, the purchase order goes to the supplier.";
    case "leave":
      return "Time off is agreed by a manager, so the rota still works.";
    default:
      return "Your business asks for a decision on this.";
  }
}

export default function ApprovalsDesk({ items, startWith }: { items: ApprovalItem[]; startWith?: string | null }) {
  const waiting = items.filter((a) => a.status === "requested");
  const decided = items.filter((a) => a.status !== "requested");
  // With nothing waiting, open on what was decided rather than on an empty list.
  const [filter, setFilter] = useState<string>(waiting.length > 0 || decided.length === 0 ? "waiting" : "decided");
  const kinds = useMemo(() => Array.from(new Set(waiting.map((a) => a.kind))), [waiting]);
  const shown =
    filter === "waiting" ? waiting : filter === "decided" ? decided : waiting.filter((a) => a.kind === filter);
  const [selectedId, setSelectedId] = useState<string | null>(startWith ?? waiting[0]?.id ?? decided[0]?.id ?? null);
  const selected = items.find((a) => a.id === selectedId) ?? shown[0] ?? null;
  const detail = useRef<HTMLDivElement>(null);
  const toast = useToast();

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing has needed a decision yet."
        detail="Refunds from the till, money spent above your limit, things to buy and time off all land here."
      />
    );
  }

  const chips: Array<{ key: string; label: string; count: number }> = [
    { key: "waiting", label: "Waiting", count: waiting.length },
    ...kinds.map((k) => ({ key: k, label: kindOf(k).label, count: waiting.filter((a) => a.kind === k).length })),
    { key: "decided", label: "Decided, last 30 days", count: decided.length },
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <section aria-label="Requests" className="overflow-hidden rounded-[20px] border border-line-brand bg-white">
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={filter === c.key}
              onClick={() => setFilter(c.key)}
              className={`tap flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${
                filter === c.key ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
              }`}
            >
              {c.label}
              <span className="num text-[11.5px] font-bold">{c.count}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="border-t border-neutral-100 px-4 py-5 text-sm text-neutral-600">
            {filter === "waiting" ? "Nothing is waiting on you. Every request has an answer." : "Nothing here."}
          </p>
        ) : (
          shown.map((a) => {
            const k = kindOf(a.kind);
            const on = selected?.id === a.id;
            const st = STATE[a.status] ?? { text: a.status, tone: "mute" as Tone };
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setSelectedId(a.id);
                  if (window.matchMedia("(max-width: 1023px)").matches) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`tap flex w-full items-start gap-3 border-t border-neutral-100 px-4 py-3 text-left ${on ? "bg-teal-50" : "hover:bg-neutral-50"}`}
              >
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-teal-50 text-teal-700">
                  <Icon name={k.icon} size={17} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{k.label}</span>
                    {a.amount !== null && <strong className="num flex-none text-[13.5px] text-ink">{formatGHS(a.amount)}</strong>}
                  </span>
                  <span className="truncate text-xs text-neutral-600">
                    {a.requesterName}
                    {a.receipt ? ` · receipt ${a.receipt}` : ""}
                    {a.days ? ` · ${daysText(a.days)}` : ""}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-500">{ago(a.decidedAt ?? a.createdAt)}</span>
                    <StatusPill tone={st.tone}>{st.text}</StatusPill>
                  </span>
                </span>
              </button>
            );
          })
        )}
      </section>

      <div ref={detail} className="scroll-mt-20">
        {selected ? (
          <Detail key={selected.id} a={selected} onDecided={(m) => toast.show(m)} />
        ) : (
          <EmptyState title="Pick a request to see it here." />
        )}
      </div>
      <Toast message={toast.message} />
    </div>
  );
}

function Detail({ a, onDecided }: { a: ApprovalItem; onDecided: (message: string) => void }) {
  const { run, busy, error, setError } = useOfficeAction();
  const [note, setNote] = useState("");
  const k = kindOf(a.kind);
  const st = STATE[a.status] ?? { text: a.status, tone: "mute" as Tone };
  const first = a.requesterName.split(/\s+/)[0] || a.requesterName;
  const open = a.status === "requested";

  async function decide(approved: boolean) {
    if (!approved && note.trim().length < 2) {
      setError(`Say why you are turning it down. ${first} sees your note.`);
      return;
    }
    const ok = await run(a.id, { action: "decide_approval", approvalId: a.id, approved, note: note.trim() || undefined });
    if (ok) onDecided(approved ? `Approved. ${first} can go ahead.` : `Turned down. ${first} sees your note.`);
  }

  const context: Array<[string, string]> = [];
  if (a.receipt) context.push(["Receipt", a.receipt]);
  if (a.returned)
    context.push([
      "What came back",
      a.returned === "restock" ? "Goods back on the shelf" : a.returned === "damaged" ? "Goods came back damaged, written off on approval" : "Nothing came back",
    ]);
  if (a.ruleAbove !== null && a.ruleAbove > 0) context.push(["Your limit", formatGHS(a.ruleAbove)]);
  if (a.days) context.push(["Days off", daysText(a.days)]);

  const trail = [
    { id: "asked", title: `${a.requesterName} asked`, detail: when(a.createdAt), tone: "teal" as Tone },
    ...(a.decidedAt
      ? [
          {
            id: "decided",
            title: `${a.status === "approved" ? "Approved" : a.status === "rejected" ? "Turned down" : "Closed"}${a.deciderName ? ` by ${a.deciderName}` : ""}`,
            detail: `${when(a.decidedAt)}${a.decisionNote ? `. "${a.decisionNote}"` : ""}`,
            tone: (a.status === "approved" ? "ok" : "bad") as Tone,
          },
        ]
      : [{ id: "waiting", title: "Waiting on a decision", detail: `Since ${ago(a.createdAt)}`, tone: "warn" as Tone }]),
  ];

  return (
    <section aria-label="The request" className="flex flex-col gap-[18px] rounded-[20px] border border-line-brand bg-white px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-teal-700">{k.label} request</span>
          <span className="font-heading text-[20px] font-extrabold leading-tight text-ink-heading">
            {a.amount !== null ? formatGHS(a.amount) : a.days ? daysText(a.days) : k.label}
            {a.receipt ? ` on receipt ${a.receipt}` : ""}
          </span>
          {a.reason && <span className="text-[14px] text-neutral-700">&ldquo;{a.reason}&rdquo;</span>}
        </span>
        <StatusPill tone={st.tone}>{st.text}</StatusPill>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-panel bg-neutral-100 px-4 py-3 sm:grid-cols-4">
        <Fact label="Asked by" value={a.requesterName} sub={a.requesterRole ? ROLE[a.requesterRole] ?? a.requesterRole : undefined} />
        <Fact label="When" value={when(a.createdAt)} sub={ago(a.createdAt)} />
        {a.days ? (
          <Fact label="Days" value={daysText(a.days)} />
        ) : (
          <Fact label="Amount" value={a.amount !== null ? formatGHS(a.amount) : "No amount"} />
        )}
        <Fact label="Decided by" value={a.deciderName ?? (open ? "An owner or manager" : "Ascend")} sub={open ? "Not the person who asked" : undefined} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-neutral-600">Why it needs you</span>
          <p className="flex gap-2 rounded-panel bg-gold-100 px-3 py-2.5 text-[13px] text-gold-700">
            <span className="mt-px flex-none">
              <Icon name="alert" size={16} />
            </span>
            {whyItNeedsYou(a)}
          </p>
          {context.length > 0 && (
            <>
              <span className="pt-1 text-xs font-semibold text-neutral-600">What it is tied to</span>
              {context.map(([k2, v]) => (
                <span key={k2} className="flex justify-between gap-3 text-[13px]">
                  <span className="text-neutral-600">{k2}</span>
                  <strong className="text-right text-ink">{v}</strong>
                </span>
              ))}
            </>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-neutral-600">What has happened</span>
          <Timeline entries={trail} />
        </div>
      </div>

      {open && a.isOwnRequest && (
        <p className="rounded-panel bg-neutral-100 px-4 py-3 text-[13px] text-neutral-700">This is your own request. Someone else on the team has to decide it.</p>
      )}
      {open && !a.isOwnRequest && (
        <div className="flex flex-col gap-2.5 border-t border-neutral-100 pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-neutral-600">Note to {first}, needed if you turn it down</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a reason" className={fieldClass} />
          </label>
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => decide(true)} disabled={busy === a.id} className={`${primaryAction} disabled:opacity-60`}>
              <Icon name="check" size={16} />
              {busy === a.id ? "Saving your answer..." : `Approve${a.amount !== null ? ` ${formatGHS(a.amount)}` : ""}`}
            </button>
            <button type="button" onClick={() => decide(false)} disabled={busy === a.id} className={`${secondaryAction} disabled:opacity-60`}>
              Turn it down
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-neutral-600">{label}</span>
      <strong className="truncate text-[13.5px] text-ink">{value}</strong>
      {sub && <span className="truncate text-xs text-neutral-600">{sub}</span>}
    </span>
  );
}
