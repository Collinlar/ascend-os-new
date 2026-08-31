import type { ReactNode } from "react";

// The Business Web page frame.
//
// Every screen below the app bar sits on the same canvas, in the same
// 1200px column, and opens with the same title block. Before this each
// page carried its own white header bar, which meant the app had two
// headers stacked on every screen and a different measure on each one.

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-24 pt-6 sm:px-8 sm:pb-16 sm:pt-7">
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
    <div className="mb-[18px] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.025em] text-ink">
          {title}
        </h1>
        {intro && (
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-grey">
            {intro}
          </p>
        )}
      </div>
      {action && <div className="flex-none">{action}</div>}
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
      className={`overflow-hidden rounded-[18px] border border-line-soft bg-white shadow-lift ${className}`}
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
        last ? "" : "border-b border-[#EEF3F7]"
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
    <div className="rounded-[18px] border border-line-soft bg-white px-6 py-14 text-center shadow-lift">
      <p className="text-base font-bold text-ink">{title}</p>
      {detail && (
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-slate-grey">
          {detail}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
