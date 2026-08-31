"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
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
}: {
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
            "On the Ascend dashboard, open Tills",
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
            "Tap check again below",
          ],
          foot: "A product with no price stays hidden here, even once it is added.",
        };

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
            {retrying ? "Checking..." : "Check again"}
          </button>
        )}

        <p className="mt-4 text-xs text-white/50">{copy.foot}</p>
      </div>
    </div>
  );
}
