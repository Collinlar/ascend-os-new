"use client";

import { useState } from "react";
import { formatShelfGHS } from "@/lib/money";
import { BackButton, Photo, Stepper, type StorefrontProduct } from "./storefront-parts";

// One product, at the size somebody decides by.
//
// The grid is for scanning. This is where a customer reads the description
// the merchant wrote and picks how many, so the photo gets the top of the
// screen and the price sits beside the name rather than under a fold.

export default function ProductDetail({
  product,
  inBasket,
  onBack,
  onAdd,
}: {
  product: StorefrontProduct;
  inBasket: number;
  onBack: () => void;
  onAdd: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-5xl md:grid md:grid-cols-2 md:gap-11 md:px-11 md:pt-8">
        <div className="relative md:rounded-[22px]">
          <div className="aspect-square w-full overflow-hidden md:rounded-[22px]">
            <Photo
              product={product}
              rounded="rounded-none md:rounded-[22px]"
              sizeHint="(min-width: 768px) 520px, 100vw"
              monogram="text-6xl"
            />
          </div>
          <div className="md:hidden">
            <BackButton onClick={onBack} label="Back to the shop" floating />
          </div>
        </div>

        <div className="px-5 pt-5 md:px-0 md:pt-0">
          <button
            type="button"
            onClick={onBack}
            className="tap mb-4 hidden items-center gap-2 text-sm font-bold text-teal-dark md:flex"
          >
            <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden>
              <polyline
                points="7.5,1 1,7.5 7.5,14"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to the shop
          </button>

          {product.category && (
            <p className="eyebrow">{product.category}</p>
          )}
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink md:text-[30px]">
              {product.name}
            </h1>
            <p className="num flex-none text-[22px] font-extrabold text-teal-dark md:text-[26px]">
              {formatShelfGHS(product.price)}
            </p>
          </div>

          {product.description && (
            <p className="mt-3 text-[14.5px] font-medium leading-relaxed text-ink-muted md:text-[15px]">
              {product.description}
            </p>
          )}

          {/* What actually happens after they tap. No fee is quoted here
              because the shop sets delivery per order and a number invented
              on this page would be a charge nobody agreed to. */}
          <div className="mt-5 flex items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3.5">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden className="flex-none">
              <path
                d="M1 6h11v8H1zM12 8h4l3 3v3h-7z"
                stroke="#0B6F65"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="5" cy="16" r="1.8" stroke="#0B6F65" strokeWidth="1.5" />
              <circle cx="15" cy="16" r="1.8" stroke="#0B6F65" strokeWidth="1.5" />
            </svg>
            <p className="text-[12.5px] font-medium leading-snug text-ink-muted">
              Collect it yourself, or ask for delivery at checkout. The shop
              confirms the cost with you on WhatsApp before anything moves.
            </p>
          </div>

          {inBasket > 0 && (
            <p className="mt-4 text-sm font-semibold text-teal-dark">
              {inBasket} already in your basket.
            </p>
          )}
        </div>
      </div>

      {/* Sticky, because the decision is made while looking at the photo
          and a customer should never scroll back up to act on it. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Stepper
            quantity={quantity}
            onChange={(n) => setQuantity(Math.max(1, n))}
            label={product.name}
          />
          <button
            type="button"
            onClick={() => onAdd(quantity)}
            className="tap flex flex-1 items-center justify-center rounded-panel bg-teal font-bold text-white shadow-action"
          >
            Add {quantity > 1 ? `${quantity} ` : ""}
            <span className="num ml-1">
              {formatShelfGHS(product.price * quantity)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
