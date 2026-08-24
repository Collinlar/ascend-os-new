"use client";

import { useMemo, useState } from "react";
import { formatShelfGHS } from "@/lib/money";
import { Photo, type StorefrontProduct } from "./storefront-parts";

// The store front page: who this shop is, then everything it sells.
//
// A customer arrives from a WhatsApp link knowing only the name they were
// sent. The hero has to answer "whose shop is this and can I trust it"
// before the grid answers "what do they have", because a stranger who
// cannot place the shop does not scroll.

export default function StoreBrowse({
  businessName,
  city,
  products,
  onOpen,
  onAdd,
  basket,
}: {
  businessName: string;
  city: string | null;
  products: StorefrontProduct[];
  onOpen: (product: StorefrontProduct) => void;
  onAdd: (product: StorefrontProduct) => void;
  basket: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of products) {
      if (!p.category) continue;
      seen.set(p.category, (seen.get(p.category) ?? 0) + 1);
    }
    // Biggest first: a customer scanning chips wants the aisle with the
    // most in it, not whichever happened to be entered first.
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [products]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, category]);

  const featured = products.find((p) => p.image) ?? products[0] ?? null;

  return (
    <div>
      {/* Hero. Everything in it is a fact about this shop, because a
          storefront that opens with a claim nobody wrote reads as a
          template with a name dropped into it. */}
      <section className="bg-navy-deep px-5 py-10 sm:px-11 sm:py-14">
        <div className="mx-auto grid max-w-5xl items-center gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            {city && (
              <span className="inline-flex items-center gap-2 rounded-full bg-teal-mint-bright/15 px-3 py-1.5 text-xs font-bold text-teal-mint-bright">
                {city}, Ghana
              </span>
            )}
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white sm:text-[40px]">
              {businessName}
            </h1>
            <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-on-dark">
              {products.length > 0
                ? `Pick what you need from ${products.length} ${
                    products.length === 1 ? "item" : "items"
                  }, order in a minute, and we confirm on WhatsApp. Collect it or have it brought to you.`
                : "This shop is open. Nothing is listed on the page just yet."}
            </p>
            {products.length > 0 && (
              <a
                href="#shop-all"
                className="tap mt-6 inline-flex items-center rounded-panel bg-teal-bright px-7 font-bold text-teal-deepest"
              >
                {products.length === 1 ? "See what we have" : `Shop all ${products.length}`}
              </a>
            )}
          </div>

          {featured && (
            <button
              type="button"
              onClick={() => onOpen(featured)}
              className="tap relative hidden aspect-square w-full overflow-hidden rounded-[22px] lg:block"
            >
              <Photo product={featured} rounded="rounded-[22px]" sizeHint="320px" monogram="text-4xl" />
              <span className="absolute inset-0 rounded-[22px] bg-gradient-to-t from-navy-deep/85 to-transparent" />
              <span className="absolute inset-x-4 bottom-4 text-left">
                <span className="block text-lg font-extrabold leading-tight text-white">
                  {featured.name}
                </span>
                <span className="num mt-0.5 block text-[15px] font-bold text-teal-mint-bright">
                  {formatShelfGHS(featured.price)}
                </span>
              </span>
            </button>
          )}
        </div>
      </section>

      {products.length === 0 ? (
        <p className="px-5 py-20 text-center text-ink-muted">
          Nothing is on this page yet. Check back soon.
        </p>
      ) : (
        <div className="mx-auto max-w-5xl px-5 pb-28 pt-6 sm:px-11 sm:pb-16">
          {/* Search earns its place once there is more here than fits on
              one screen of a phone. Below that it is a box in the way. */}
          {products.length > 6 && (
            <div className="relative">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              >
                <circle cx="7" cy="7" r="5" stroke="#8FA3B1" strokeWidth="1.6" />
                <line
                  x1="11"
                  y1="11"
                  x2="14.5"
                  y2="14.5"
                  stroke="#8FA3B1"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={`Search ${businessName}`}
                placeholder={`Search ${businessName}`}
                className="w-full rounded-panel border border-line bg-surface pl-11 pr-4 font-medium text-ink outline-none placeholder:text-slate-grey focus:border-teal"
              />
            </div>
          )}

          {categories.length > 1 && (
            <div className="scr -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip
                label="Everything"
                active={category === null}
                onClick={() => setCategory(null)}
              />
              {categories.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={category === c}
                  onClick={() => setCategory(category === c ? null : c)}
                />
              ))}
            </div>
          )}

          <h2
            id="shop-all"
            className="mt-7 scroll-mt-20 text-xl font-extrabold tracking-[-0.02em] text-ink"
          >
            {category ?? "Shop all"}
          </h2>

          {shown.length === 0 ? (
            <p className="py-14 text-center text-ink-muted">
              Nothing here matches {query ? `"${query}"` : "that"}. Try another
              word.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {shown.map((p) => (
                <Tile
                  key={p.id}
                  product={p}
                  inBasket={basket[p.id] ?? 0}
                  onOpen={() => onOpen(p)}
                  onAdd={() => onAdd(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap flex flex-none items-center whitespace-nowrap rounded-chip px-4 text-sm font-bold ${
        active
          ? "bg-ink text-white"
          : "border border-line bg-surface text-ink-soft"
      }`}
    >
      {label}
    </button>
  );
}

function Tile({
  product,
  inBasket,
  onOpen,
  onAdd,
}: {
  product: StorefrontProduct;
  inBasket: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="relative">
      <div className="relative aspect-square w-full overflow-hidden rounded-panel">
        <Photo product={product} sizeHint="(min-width: 1024px) 240px, (min-width: 768px) 30vw, 45vw" />

        {/* Adding is one tap from the grid. Opening the product is for
            somebody who wants to read before they commit, which is a
            different customer to the one restocking a weekly shop. It sits
            above the stretched open target so the two never fight. */}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${product.name} to your basket`}
          className={`tap absolute bottom-2 right-2 z-10 flex h-11 w-11 items-center justify-center rounded-control shadow-card ${
            inBasket > 0 ? "bg-teal text-white" : "bg-white/95 text-teal-dark"
          }`}
        >
          {inBasket > 0 ? (
            <span className="num text-sm font-extrabold">{inBasket}</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-2 block w-full text-left"
      >
        {/* Stretched over the whole tile, so the photo opens the product
            without needing a second control that says the same thing. */}
        <span aria-hidden className="absolute inset-0" />
        <span className="block text-[13.5px] font-bold leading-snug text-navy-soft">
          {product.name}
        </span>
        <span className="num mt-0.5 block text-[15px] font-extrabold text-teal-dark">
          {formatShelfGHS(product.price)}
        </span>
      </button>
    </div>
  );
}
