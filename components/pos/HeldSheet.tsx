"use client";

// @contrast-surface navy
// The till is a dark screen. Everything below reads on navy, which is
// what npm run check:contrast measures against.
import { formatGHS } from "@/lib/money";
import { heldFor, type HeldSale } from "@/lib/pos/held";

// Parked baskets. The cashier calls one out by name across the counter
// ("Sale B"), so the label leads and the reference is secondary.

export default function HeldSheet({
  held,
  onResume,
  onDiscard,
  onClose,
}: {
  held: HeldSale[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50">
      <div className="animate-sheetup max-h-[80vh] overflow-y-auto rounded-t-card bg-navy px-4 pb-6 pt-4 text-white">
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="text-lg font-extrabold tracking-[-0.02em]">
            Sales you parked
          </h2>
          <button onClick={onClose} className="tap px-2 text-sm font-bold text-white/70">
            Close
          </button>
        </div>

        {held.length === 0 ? (
          <p className="py-8 text-center text-white/60">
            Nothing parked. Hold a sale when a customer steps away.
          </p>
        ) : (
          <div className="space-y-2">
            {held.map((sale) => (
              <div
                key={sale.id}
                className="rounded-panel bg-white/10 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="font-bold">{sale.label}</p>
                    <p className="mono text-[11px] text-white/55">
                      {sale.reference} · {sale.itemCount} item
                      {sale.itemCount === 1 ? "" : "s"} · {heldFor(sale.heldAt)}
                    </p>
                  </div>
                  <p className="num font-bold">{formatGHS(sale.total)}</p>
                </div>

                {sale.customerName && (
                  <p className="mt-1 text-sm text-white/70">{sale.customerName}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onResume(sale.id)}
                    className="tap flex-[2] rounded-control bg-teal py-2.5 text-sm font-bold"
                  >
                    Bring it back
                  </button>
                  <button
                    onClick={() => onDiscard(sale.id)}
                    className="tap rounded-control px-4 text-sm font-medium text-white/60"
                  >
                    Throw away
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
