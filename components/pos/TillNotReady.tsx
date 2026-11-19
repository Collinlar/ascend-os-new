"use client";

// @contrast-surface navy
// Two grounds: navy on the PIN screen (no_roster), white inside the light
// selling layouts (no_products). The light branch marks its own surface.
import { Eyebrow } from "@/components/brand/Mark";

// A till that cannot sell yet, and why.
//
// The person standing at the counter is usually not the person who can fix
// it. So this names what is missing, says who does it and where, and does
// not pretend the cashier has a button. A dead end that explains itself is
// the difference between a merchant ringing for help and a merchant giving
// up on the product.

export default function TillNotReady({
  reason,
  businessLabel,
  onRetry,
  retrying,
  light,
}: {
  /** Inside the light selling layouts, rather than on the navy PIN screen. */
  light?: boolean;
  reason: "no_roster" | "no_products";
  businessLabel?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const copy =
    reason === "no_roster"
      ? {
          title: "Nobody can open this till yet.",
          body: "The owner gives each person a 4 digit PIN before anyone can sell.",
          steps: [
            "On the Ascend dashboard, open Devices",
            "Under Who can open a till, tap Give a PIN",
            "Come back here and enter it",
          ],
          foot: "The till is set up. It just does not know who you are.",
        }
      : {
          title: "This till has nothing to sell yet.",
          body: "Products with a price reach the till on its own. Nothing has arrived.",
          steps: [
            "On the Ascend dashboard, open Products",
            "Add what you sell, and put a price on each one",
            "Come back here and tap the button below",
          ],
          foot: "A product with no price stays hidden here, even once it is added.",
        };

  const again = reason === "no_roster" ? "Look for my PIN again" : "Look for products again";

  if (light) {
    return (
      <>
        {/* @contrast-surface white */}
        <div className="mx-auto w-full max-w-md py-10 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">{businessLabel ?? "Ascend POS"}</p>
          <h2 className="mt-2 font-heading text-[22px] font-extrabold text-ink-heading">{copy.title}</h2>
          <p className="mt-2 text-[14.5px] text-neutral-600">{copy.body}</p>
          <ol className="mt-5 space-y-2 text-left">
            {copy.steps.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-control border border-line-brand bg-white px-4 py-3">
                <span className="num shrink-0 text-[14px] font-bold text-teal-700">{i + 1}</span>
                <span className="text-[14px] text-ink">{step}</span>
              </li>
            ))}
          </ol>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="tap mt-5 flex h-12 w-full items-center justify-center rounded-control bg-teal text-[15px] font-bold text-white disabled:opacity-50"
            >
              {retrying ? "Looking..." : again}
            </button>
          )}
          <p className="mt-3 text-[12.5px] text-neutral-500">{copy.foot}</p>
        </div>
        {/* @contrast-surface navy */}
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-sm">
        <Eyebrow tone="mint">{businessLabel ?? "Ascend POS"}</Eyebrow>
        <h2 className="mt-3 text-xl font-extrabold tracking-[-0.02em]">{copy.title}</h2>
        <p className="mt-2 text-sm text-on-dark">{copy.body}</p>

        <ol className="mt-6 space-y-2 text-left">
          {copy.steps.map((step, i) => (
            <li key={i} className="flex gap-3 rounded-panel bg-white/10 px-4 py-3">
              <span className="num shrink-0 text-sm font-bold text-teal-mint">{i + 1}</span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>

        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="tap mt-6 w-full rounded-control bg-teal py-3.5 font-semibold disabled:opacity-50"
          >
            {retrying ? "Looking..." : again}
          </button>
        )}

        <p className="mt-4 text-xs text-white/50">{copy.foot}</p>
      </div>
    </div>
  );
}
