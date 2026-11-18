"use client";

// The filter rail.
//
// Sell and Orders both narrow a long list the same way, so they narrow it
// with the same control. Each pill says what it keeps, not what it hides,
// and the count beside the rail says how much survived.

export interface Pill {
  label: string;
  count?: number;
}

export default function Pills({
  pills,
  active,
  onPick,
  trailing,
}: {
  pills: Pill[];
  active: string;
  onPick: (label: string) => void;
  /** Usually how many rows the current filter left. */
  trailing?: string;
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <div className="scr flex gap-2 overflow-x-auto">
        {pills.map((p) => {
          const on = p.label === active;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onPick(p.label)}
              aria-pressed={on}
              className={`tap flex flex-none items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold ${
                on
                  ? "border-teal bg-teal-50 text-teal-800"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
              }`}
            >
              {p.label}
              {p.count !== undefined && p.count > 0 && (
                <span className="num text-[11px] font-bold text-neutral-600">
                  {p.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing && (
        <>
          <span className="flex-1" />
          <span className="hidden whitespace-nowrap text-[12.5px] text-neutral-500 sm:block">
            {trailing}
          </span>
        </>
      )}
    </div>
  );
}
