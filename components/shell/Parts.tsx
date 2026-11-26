import type { ReactNode } from "react";

// The small pieces every module draws the same way (business modules
// design, M1): a status pill, a "came from" tag, a person's initials, and a
// timeline. One definition each, so "Overdue" is the same red on an
// invoice, a booking and a customer.

export type Tone = "ok" | "warn" | "bad" | "info" | "mute" | "teal";

const TONE: Record<Tone, string> = {
  ok: "bg-success-tint text-success-ink",
  warn: "bg-gold-100 text-gold-700",
  bad: "bg-danger-tint text-danger-ink",
  info: "bg-info-light text-info-ink",
  mute: "bg-neutral-100 text-neutral-600",
  teal: "bg-teal-100 text-teal-800",
};

/** A record's state: Paid, Overdue, Confirmed, Waiting. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] text-[11.5px] font-bold ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Where a record came from, or what it is tied to: "Shop order", "Booking BK-2281". */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-[7px] bg-neutral-100 px-2 text-[11.5px] font-semibold text-neutral-700">
      {children}
    </span>
  );
}

// A colour per person, the same every time their name appears. Each carries
// white at 4.5:1 or better.
const AVATAR = ["#007A6F", "#185FA5", "#7C3AED", "#B45309", "#BE185D", "#0F766E", "#4B5563"];

export function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    // @contrast-ignore the ground is one of AVATAR's colours, each 4.5:1 or better under white
    <span
      aria-hidden
      className="inline-flex flex-none items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.37), background: AVATAR[hash % AVATAR.length] }}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface TimelineEntry {
  id: string;
  title: ReactNode;
  /** When, and anything else worth one line. */
  detail?: ReactNode;
  tone?: Tone;
}

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-gold",
  bad: "bg-danger",
  info: "bg-info",
  mute: "bg-neutral-300",
  teal: "bg-teal-brand",
};

/** What happened, in order: an invoice's evidence, a booking's progress. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-3.5 last:pb-0">
          {i < entries.length - 1 && <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-10px)] w-px bg-neutral-200" />}
          <span aria-hidden className={`mt-[5px] h-[11px] w-[11px] flex-none rounded-full ${DOT[e.tone ?? "teal"]}`} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-ink">{e.title}</span>
            {e.detail && <span className="text-xs text-neutral-500">{e.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
