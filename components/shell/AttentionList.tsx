import Link from "next/link";
import { Icon, type IconName } from "./icons";

// "Needs attention" (v3 design): what is waiting on the owner, one row each,
// most time-sensitive first. Each row says what happened and where to deal
// with it, and the whole row is the link.

export interface AttentionRow {
  id: string;
  title: string;
  /** The way to deal with it, said as the link's words. */
  action: string;
  href: string;
  tone: "gold" | "teal" | "red";
  icon: IconName;
}

const TONE: Record<AttentionRow["tone"], string> = {
  gold: "bg-gold-100 text-gold-700",
  teal: "bg-teal-50 text-teal-800",
  red: "bg-danger-tint text-danger-ink",
};

export default function AttentionList({
  rows,
  quiet,
}: {
  rows: AttentionRow[];
  /** What to say when nothing is waiting, in this business's own terms. */
  quiet: string;
}) {
  return (
    <section aria-labelledby="attention" className="overflow-hidden rounded-[20px] border border-line-brand bg-white">
      <div className="flex items-baseline justify-between px-[18px] pb-2 pt-4">
        <h2 id="attention" className="font-heading text-base font-bold text-ink-heading">
          Needs attention
        </h2>
        {rows.length > 0 && <span className="text-[12.5px] text-neutral-500">{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-neutral-100 px-[18px] py-4 text-sm text-neutral-600">{quiet}</p>
      ) : (
        rows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            className="tap flex items-center gap-3 border-t border-neutral-100 px-[18px] py-[11px] hover:bg-teal-50"
          >
            <span className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] ${TONE[row.tone]}`}>
              <Icon name={row.icon} size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="text-[13.5px] font-semibold text-ink">{row.title}</span>
              <span className="text-xs font-medium text-teal-dark">{row.action}</span>
            </span>
            {/* @contrast-ignore a decorative chevron, hidden from screen readers; the row's words carry the link */}
            <span aria-hidden className="text-neutral-300">
              <Icon name="chev" size={16} />
            </span>
          </Link>
        ))
      )}
    </section>
  );
}
