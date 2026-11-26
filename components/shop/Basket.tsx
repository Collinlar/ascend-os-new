"use client";

import { formatGHS, formatShelfGHS } from "@/lib/money";
import { BackButton, Photo, Stepper, type StorefrontProduct } from "./storefront-parts";
import { lowestFee, type ShopSettings } from "@/lib/shop/settings";

// What they are about to order, still changeable.
//
// The last screen before a customer hands over their number, so every line
// stays editable here rather than at checkout, where changing your mind
// means going backwards through a form. Below the lines, what the shop's
// customers often buy with them (round 2, R4).

export interface BasketLine {
  /** The product id, or "product:size". */
  key: string;
  product: StorefrontProduct;
  size: { id: string; name: string; price: number } | null;
  quantity: number;
  /** The price of one, with the size. */
  price: number;
}

export default function Basket({
  lines,
  subtotal,
  settings,
  suggestions,
  onBack,
  onSetQuantity,
  onCheckout,
  onOpen,
  onAdd,
}: {
  lines: BasketLine[];
  subtotal: number;
  settings: ShopSettings;
  suggestions: StorefrontProduct[];
  onBack: () => void;
  onSetQuantity: (key: string, quantity: number) => void;
  onCheckout: () => void;
  onOpen: (product: StorefrontProduct) => void;
  onAdd: (product: StorefrontProduct) => void;
}) {
  const low = lowestFee(settings.deliveryAreas);
  const delivery = !settings.deliveryEnabled
    ? "Pickup only, free"
    : low === null
      ? settings.pickupEnabled
        ? "Free pickup, or delivery agreed with the shop"
        : "Agreed with the shop"
      : `${settings.pickupEnabled ? "Free pickup, or delivery " : "Delivery "}from ${formatGHS(low)}`;

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-40 pt-4 sm:px-11 lg:pb-16">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} label="Back to the shop" />
        <h1 className="text-xl font-extrabold text-ink">Your basket</h1>
      </div>

      {lines.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-light-grey">
            <svg width="28" height="28" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path
                d="M3 3h2l1.5 11.5a1.5 1.5 0 0 0 1.5 1.3h8.3a1.5 1.5 0 0 0 1.5-1.2L19 7H6"
                stroke="#9CA3AF"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="mt-4 font-bold text-ink-muted">Nothing in here yet</p>
          <button
            type="button"
            onClick={onBack}
            className="tap mt-4 inline-flex items-center rounded-control bg-ink px-6 font-bold text-white"
          >
            See what the shop has
          </button>
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-3">
            {lines.map(({ key, product, size, quantity, price }) => (
              <div key={key} className="flex items-center gap-3 rounded-panel bg-surface p-3">
                <div className="h-[66px] w-[66px] flex-none overflow-hidden rounded-control">
                  <Photo product={product} rounded="rounded-control" sizeHint="66px" monogram="text-base" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-navy-soft">{product.name}</p>
                  <p className="text-[11.5px] font-medium text-slate-grey">
                    {size ? `${size.name} · ` : ""}
                    {formatShelfGHS(price)} each
                  </p>
                  <p className="num mt-1 text-[14px] font-extrabold text-ink">{formatShelfGHS(price * quantity)}</p>
                </div>
                <Stepper
                  quantity={quantity}
                  onChange={(n) => onSetQuantity(key, n)}
                  label={size ? `${product.name}, ${size.name}` : product.name}
                  tone="plain"
                />
              </div>
            ))}

            {suggestions.length > 0 && (
              <section className="mt-4">
                <h2 className="text-[15px] font-extrabold text-ink">Goes well with</h2>
                <p className="text-[12.5px] font-medium text-slate-grey">What this shop&rsquo;s customers often buy together</p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {suggestions.map((p) => (
                    <div key={p.id} className="flex min-w-0 flex-col gap-1.5">
                      <button type="button" onClick={() => onOpen(p)} aria-label={`Open ${p.name}`} className="tap block aspect-square w-full overflow-hidden rounded-[14px]">
                        <Photo product={p} rounded="rounded-[14px]" sizeHint="120px" monogram="text-xl" />
                      </button>
                      <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink">{p.name}</span>
                      <span className="flex items-center justify-between gap-1">
                        <span className="num text-[13px] font-extrabold text-ink">
                          {p.sizes?.length ? "from " : ""}
                          {formatShelfGHS(p.sizes?.length ? Math.min(...p.sizes.map((z) => z.price)) : p.price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAdd(p)}
                          aria-label={p.sizes?.length ? `Choose a size of ${p.name}` : `Add ${p.name} to your basket`}
                          className="tap flex h-11 w-11 flex-none items-center justify-center rounded-full bg-teal text-lg font-bold text-white"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* The total, at the bottom of a phone and beside the lines on a
              laptop. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-24 lg:z-0 lg:rounded-panel lg:border lg:p-5">
            <div className="mx-auto max-w-2xl">
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="font-medium text-ink-muted">Subtotal</span>
                <span className="num font-bold text-ink-muted">{formatGHS(subtotal)}</span>
              </div>
              <div className="mb-3 flex justify-between gap-3 text-[13px]">
                <span className="font-medium text-ink-muted">Getting it</span>
                <span className="text-right font-bold text-ink-muted">{delivery}</span>
              </div>
              <button
                type="button"
                onClick={onCheckout}
                className="tap flex w-full items-center justify-between rounded-panel bg-teal px-6 font-bold text-white shadow-action"
              >
                <span>Checkout</span>
                <span className="num">{formatGHS(subtotal)}</span>
              </button>
              <p className="mt-2 text-center text-[11.5px] font-medium text-slate-grey">No account needed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
