import type { ReactNode } from "react";

// The Business Web page frame (v3 design).
//
// Every screen sits on the same app ground, in the same 1140px column, and
// opens with the same title block: a 28px Outfit title, one line saying what
// the screen is for, and the action it exists to start. Lists sit on white
// cards with the teal-tinted hairline the design uses everywhere.

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[1140px] px-5 pb-28 pt-6 sm:px-8 sm:pb-16 sm:pt-7">
        {children}
      </div>
    </main>
  );
}

export function PageHeader({
  title,
  intro,
  action,
}: {
  title: string;
  /** What the screen is for, in one line a merchant would say. */
  intro?: string;
  /** The single thing this screen exists to start. */
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[26px] font-extrabold leading-[1.1] text-ink-heading sm:text-[28px]">{title}</h1>
        {intro && <p className="max-w-2xl text-sm text-neutral-600">{intro}</p>}
      </div>
      {action && <div className="flex flex-none flex-wrap gap-2">{action}</div>}
    </div>
  );
}

// The surface a list or a table sits on.
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[18px] border border-line-brand bg-white ${className}`}
    >
      {children}
    </div>
  );
}

// A row inside a Panel. The divider stops at the last one, so a list never
// ends on a line that separates it from nothing.
export function PanelRow({
  children,
  last = false,
  className = "",
}: {
  children: ReactNode;
  last?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-[22px] py-4 ${
        last ? "" : "border-b border-neutral-100"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Something the merchant has not done yet, said without alarm.
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-line-brand bg-white px-6 py-12 text-center">
      <p className="font-heading text-base font-bold text-ink-heading">{title}</p>
      {detail && <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600">{detail}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// A row of figures at the top of a page (v3 design). Each says what it
// counts, the figure, and one line of context. Never a placeholder: a
// figure that cannot be read is left out by the page.
export function FigureRow({
  figures,
}: {
  figures: Array<{ label: string; value: string; sub?: string; tone?: "warn" | "bad" }>;
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label} className="flex flex-col gap-[3px] rounded-panel border border-line-brand bg-white px-4 py-3.5">
          <span className="text-xs text-neutral-500">{f.label}</span>
          <span
            className={`num font-heading text-[21px] font-extrabold ${
              f.tone === "bad" ? "text-danger-ink" : f.tone === "warn" ? "text-gold-700" : "text-ink-heading"
            }`}
          >
            {f.value}
          </span>
          {f.sub && <span className="text-[11.5px] text-neutral-500">{f.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/** The primary action a page header carries (v3: 40px, 12px round). */
export const primaryAction =
  "tap inline-flex min-h-[44px] items-center gap-2 rounded-control bg-teal px-4 text-[13.5px] font-bold text-white hover:bg-teal-hover";
/** A secondary action beside it. */
export const secondaryAction =
  "tap inline-flex min-h-[44px] items-center gap-2 rounded-control border-[1.5px] border-line-brand bg-white px-4 text-[13.5px] font-bold text-teal-800 hover:border-teal-brand";
