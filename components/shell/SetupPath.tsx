import Link from "next/link";
import type { SetupPath as Path } from "@/lib/domains/setup";

// The road to a first sale, shown until it is walked.
//
// A merchant on day one has nothing wrong, because they have nothing at
// all. A dashboard that only reports problems has nothing to say to them,
// which is how someone ends up with a paired till and no idea why it will
// not open.

export default function SetupPath({ path }: { path: Path }) {
  if (path.readyToSell && path.remaining === 0) return null;

  const blocking = path.steps.filter((s) => !s.optional && !s.done).length;

  return (
    <section className="mb-6 rounded-card border border-line bg-white p-5">
      <p className="mono text-[11px] uppercase tracking-eyebrow text-teal-dark">
        Getting you selling
      </p>
      <h2 className="mt-2 text-lg font-semibold text-ink">
        {path.readyToSell
          ? "You can sell. One thing left worth doing."
          : blocking === 1
            ? "One step to your first sale."
            : `${blocking} steps to your first sale.`}
      </h2>

      <ol className="mt-4 space-y-1">
        {path.steps.map((step) => {
          const isNext = path.next?.id === step.id;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-panel px-3 py-3 ${
                isNext ? "bg-teal-light" : ""
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  step.done
                    ? "bg-teal text-white"
                    : "border border-mid-grey/40 text-transparent"
                }`}
              >
                {step.done ? "✓" : "•"}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    step.done ? "text-ink-muted line-through" : "text-ink"
                  }`}
                >
                  {step.label}
                  {step.optional && !step.done && (
                    <span className="ml-2 font-normal text-ink-muted">when you can</span>
                  )}
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-xs text-ink-muted">{step.detail}</p>
                )}
              </div>

              {!step.done && (
                <Link
                  href={step.href}
                  className={`tap shrink-0 self-center rounded-control px-3 py-2 text-sm font-semibold ${
                    isNext ? "bg-teal text-white" : "text-teal-dark"
                  }`}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
