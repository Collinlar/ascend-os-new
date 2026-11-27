"use client";

import { useState } from "react";
import { formatShelfGHS } from "@/lib/money";
import { BackButton, Photo, Stepper, type StorefrontProduct } from "./storefront-parts";
import ReportProblem from "@/components/risk/ReportProblem";
import { fulfilmentFacts, type ShopSettings } from "@/lib/shop/settings";

// One product, at the size somebody decides by (round 2, R4).
//
// The grid is for scanning. This is where a customer reads what the shop
// wrote, picks a size and how many, and learns how they get it, what it
// costs to get, and who they are buying from, before anything goes in the
// basket.

export default function ProductDetail({
  product,
  inBasket,
  businessName,
  slug,
  settings,
  places,
  suggestions,
  onBack,
  onAdd,
  onBuyNow,
  onOpenOther,
}: {
  product: StorefrontProduct;
  /** Of this product, all sizes together: they share its stock. */
  inBasket: number;
  businessName: string;
  slug: string;
  settings: ShopSettings;
  places: string[];
  suggestions: StorefrontProduct[];
  onBack: () => void;
  onAdd: (quantity: number, sizeId?: string) => void;
  /** Add it and go straight to checkout (round 4, S1). */
  onBuyNow?: (quantity: number, sizeId?: string) => void;
  onOpenOther: (product: StorefrontProduct) => void;
}) {
  const sizes = product.sizes ?? [];
  const [quantity, setQuantity] = useState(1);
  const [sizeId, setSizeId] = useState<string | null>(sizes.length === 1 ? sizes[0].id : null);
  const size = sizes.find((z) => z.id === sizeId) ?? null;
  const price = size?.price ?? product.price;
  const fromPrice = sizes.length ? Math.min(...sizes.map((z) => z.price)) : product.price;
  // For a counted product: how many more can go in the basket.
  const room = product.left === undefined ? Infinity : Math.max(0, product.left - inBasket);
  const needsSize = sizes.length > 0 && !size;
  const facts = fulfilmentFacts(settings, places.length > 1 ? places : []);

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-[1100px] md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-11 md:px-11 md:pt-8">
        <div className="relative md:sticky md:top-24 md:self-start">
          <div className="aspect-square w-full overflow-hidden md:rounded-[22px]">
            <Photo product={product} rounded="rounded-none md:rounded-[22px]" sizeHint="(min-width: 768px) 520px, 100vw" monogram="text-6xl" />
          </div>
          {product.bestseller && (
            <span className="absolute left-3 top-3 rounded-full bg-teal-100 px-3 py-1 text-[12px] font-bold text-teal-800">Best seller</span>
          )}
          <div className="md:hidden">
            <BackButton onClick={onBack} label="Back to the shop" floating />
          </div>
        </div>

        <div className="px-5 pt-5 md:px-0 md:pt-0">
          <button type="button" onClick={onBack} className="tap mb-4 hidden items-center gap-2 text-sm font-bold text-teal-dark md:flex">
            <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden>
              <polyline points="7.5,1 1,7.5 7.5,14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to the shop
          </button>

          <p className="text-[12.5px] font-medium text-slate-grey">
            {[product.category, businessName].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink md:text-[30px]">{product.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="num text-[22px] font-extrabold text-teal-dark md:text-[26px]">
              {sizes.length && !size ? "from " : ""}
              {formatShelfGHS(size ? price : fromPrice)}
            </span>
            {product.left !== undefined && (
              <span
                className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                  product.left === 0 ? "bg-danger-tint text-danger-ink" : product.left <= 12 ? "bg-gold-100 text-gold-700" : "bg-teal-50 text-teal-800"
                }`}
              >
                {product.left === 0 ? "Sold out for now" : product.left <= 12 ? `Only ${product.left} left` : "In stock"}
              </span>
            )}
          </p>

          {sizes.length > 0 && (
            <fieldset className="mt-5">
              <legend className="text-xs font-bold text-ink-muted">Size</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {sizes.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setSizeId(z.id)}
                    aria-pressed={sizeId === z.id}
                    className={`tap inline-flex min-h-[44px] items-center gap-2 rounded-control border-[1.5px] px-4 text-[14px] font-bold ${
                      sizeId === z.id ? "border-teal bg-teal-light text-teal-dark" : "border-line bg-white text-ink"
                    }`}
                  >
                    {z.name}
                    {z.price !== fromPrice && <span className="num text-[12.5px] font-semibold opacity-80">{formatShelfGHS(z.price)}</span>}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-[14.5px] font-medium leading-relaxed text-ink-muted md:text-[15px]">{product.description}</p>
          )}

          {product.details && (
            <div className="mt-5 flex flex-col gap-3.5">
              {(
                [
                  ["How to use", product.details.use],
                  ["What is inside", product.details.inside],
                  ["Good for", product.details.goodFor],
                ] as Array<[string, string | undefined]>
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <section key={k}>
                    <h2 className="text-[14px] font-extrabold text-ink">{k}</h2>
                    <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-ink-muted">{v}</p>
                  </section>
                ))}
            </div>
          )}

          {/* How it reaches you and who sells it, said before it goes in
              the basket, in the shop's own settings (R3). */}
          <div className="mt-5 flex flex-col rounded-panel border border-line">
            {settings.saved ? (
              <>
                {facts.pickup && <Way title={facts.pickup.title} detail={facts.pickup.detail} />}
                {facts.delivery && <Way title={facts.delivery.title} detail={[facts.delivery.detail, settings.deliveryNote].filter(Boolean).join(". ")} />}
                {facts.returns && <Way title="Returns" detail={facts.returns} />}
              </>
            ) : (
              <Way title="Collect it, or have it brought" detail="The shop confirms the delivery cost with you on WhatsApp before anything moves." />
            )}
            <Way title={`Sold and delivered by ${businessName}`} detail="Confirmed by the shop on WhatsApp. You pay on the day." />
          </div>
          <div className="mt-3">
            <ReportProblem source="shop" slug={slug} businessName={businessName} />
          </div>

          {inBasket > 0 && <p className="mt-4 text-sm font-semibold text-teal-dark">{inBasket} already in your basket.</p>}

          {suggestions.length > 0 && (
            <section className="mt-7">
              <h2 className="text-[15px] font-extrabold text-ink">Goes well with</h2>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {suggestions.map((p) => (
                  <button key={p.id} type="button" onClick={() => onOpenOther(p)} className="tap flex min-w-0 flex-col gap-1.5 text-left">
                    <span className="block aspect-square w-full overflow-hidden rounded-[14px]">
                      <Photo product={p} rounded="rounded-[14px]" sizeHint="120px" monogram="text-xl" />
                    </span>
                    <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink">{p.name}</span>
                    <span className="num text-[13px] font-extrabold text-ink">{formatShelfGHS(p.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Sticky, because the decision is made while looking at the photo
          and a customer should never scroll back up to act on it. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3">
          {room > 0 && !needsSize && (
            <Stepper quantity={Math.min(quantity, room)} onChange={(n) => setQuantity(Math.max(1, Math.min(n, room)))} label={product.name} />
          )}
          <button
            type="button"
            onClick={() => onAdd(Math.min(quantity, room), size?.id)}
            disabled={room === 0 || needsSize}
            className={`tap flex flex-1 items-center justify-center rounded-panel font-bold disabled:bg-neutral-200 disabled:text-neutral-700 disabled:shadow-none ${
              onBuyNow ? "border-[1.5px] border-teal bg-white text-teal-dark md:bg-teal md:text-white md:shadow-action" : "bg-teal text-white shadow-action"
            }`}
          >
            {room === 0 ? (
              product.left === 0 ? "Sold out for now" : "All of them are in your basket"
            ) : needsSize ? (
              "Pick a size first"
            ) : (
              <>
                Add {Math.min(quantity, room) > 1 ? `${Math.min(quantity, room)} ` : ""}
                {size ? `${size.name} ` : ""}
                <span className="num ml-1">{formatShelfGHS(price * Math.min(quantity, room))}</span>
              </>
            )}
          </button>
          {onBuyNow && room > 0 && !needsSize && (
            <button
              type="button"
              onClick={() => onBuyNow(Math.min(quantity, room), size?.id)}
              className="tap flex flex-none items-center justify-center rounded-panel bg-teal px-5 font-bold text-white shadow-action md:border-[1.5px] md:border-teal md:bg-white md:text-teal-dark md:shadow-none"
            >
              Buy now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Way({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line px-4 py-3 last:border-b-0">
      <span className="text-[13.5px] font-bold text-ink">{title}</span>
      <span className="text-[12.5px] font-medium leading-snug text-ink-muted">{detail}</span>
    </div>
  );
}
