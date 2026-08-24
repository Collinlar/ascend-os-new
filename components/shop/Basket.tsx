"use client";

import { formatGHS, formatShelfGHS } from "@/lib/money";
import { BackButton, Photo, Stepper, type StorefrontProduct } from "./storefront-parts";

// What they are about to order, still changeable.
//
// The last screen before a customer hands over their number, so every line
// stays editable here rather than at checkout, where changing your mind
// means going backwards through a form.

export interface BasketLine {
  product: StorefrontProduct;
  quantity: number;
}

export default function Basket({
  lines,
  subtotal,
  onBack,
  onSetQuantity,
  onCheckout,
}: {
  lines: BasketLine[];
  subtotal: number;
  onBack: () => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onCheckout: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-40 pt-4 sm:px-11">
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
                stroke="#93A7B4"
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
        <>
          <div className="mt-5 flex flex-col gap-3">
            {lines.map(({ product, quantity }) => (
              <div
                key={product.id}
                className="flex items-center gap-3 rounded-panel bg-surface p-3"
              >
                <div className="h-[66px] w-[66px] flex-none overflow-hidden rounded-control">
                  <Photo product={product} rounded="rounded-control" sizeHint="66px" monogram="text-base" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-navy-soft">
                    {product.name}
                  </p>
                  <p className="text-[11.5px] font-medium text-slate-grey">
                    {formatShelfGHS(product.price)} each
                  </p>
                  <p className="num mt-1 text-[14px] font-extrabold text-ink">
                    {formatShelfGHS(product.price * quantity)}
                  </p>
                </div>
                <Stepper
                  quantity={quantity}
                  onChange={(n) => onSetQuantity(product.id, n)}
                  label={product.name}
                  tone="plain"
                />
              </div>
            ))}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-2xl">
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="font-medium text-ink-muted">Subtotal</span>
                <span className="num font-bold text-ink-muted">
                  {formatGHS(subtotal)}
                </span>
              </div>
              <div className="mb-3 flex justify-between text-[13px]">
                <span className="font-medium text-ink-muted">Delivery</span>
                <span className="font-bold text-ink-muted">
                  Agreed with the shop
                </span>
              </div>
              <button
                type="button"
                onClick={onCheckout}
                className="tap flex w-full items-center justify-between rounded-panel bg-teal px-6 font-bold text-white shadow-action"
              >
                <span>Checkout</span>
                <span className="num">{formatGHS(subtotal)}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
