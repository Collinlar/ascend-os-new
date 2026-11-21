"use client";

import { useMemo, useState } from "react";
import { formatShelfGHS } from "@/lib/money";
import { Photo, type StorefrontProduct } from "./storefront-parts";
import ReportProblem from "@/components/risk/ReportProblem";

// The store front page, on the v3 Discover design's shop front: a banner,
// who this shop is and what it sells, and beside it who you are buying
// from. Every line in the side column is a fact Ascend holds; the design's
// ratings, labels and opening hours wait until they are real.
//
// A customer arrives from a WhatsApp link knowing only the name they were
// sent. The hero has to answer "whose shop is this and can I trust it"
// before the grid answers "what do they have", because a stranger who
// cannot place the shop does not scroll.

export default function StoreBrowse({
  slug,
  businessName,
  city,
  memberSince,
  places,
  products,
  onOpen,
  onAdd,
  basket,
}: {
  slug: string;
  businessName: string;
  city: string | null;
  memberSince: string | null;
  places: { name: string; city: string | null }[];
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

  const pictured = products.filter((p) => p.image).slice(0, 5);

  const since = memberSince
    ? new Date(memberSince).toLocaleDateString("en-GH", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-5 sm:px-8 sm:pb-16">
      {/* The banner: the shop's own shelf. A shop's pictures are its
          products, so they are shown whole, side by side, rather than one
          packshot blown up and cropped into a shop front it is not. */}
      <div className="flex h-[150px] items-stretch gap-3 overflow-hidden rounded-[28px] bg-teal-50 p-4 sm:h-[240px] sm:gap-4 sm:p-6">
        {pictured.length > 0 ? (
          pictured.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p)}
              aria-label={`Open ${p.name}`}
              className={`tap aspect-square h-full flex-none overflow-hidden rounded-[18px] bg-white p-2 ${i >= 3 ? "hidden sm:block" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image as string} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
          ))
        ) : (
          // @contrast-ignore a decorative initial standing in for a banner picture, hidden from screen readers
          <span aria-hidden className="flex flex-1 items-center justify-center font-heading text-[48px] font-extrabold text-teal-700/40">
            {businessName.slice(0, 1)}
          </span>
        )}
      </div>

      <div className="mt-6 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <h1 className="font-heading text-[30px] font-extrabold leading-[1.1] text-ink-heading sm:text-[34px]">{businessName}</h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            {[categories.slice(0, 3).join(", "), city, products.length > 0 ? `${products.length} ${products.length === 1 ? "item" : "items"}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-neutral-700">
            {products.length > 0
              ? "Pick what you need and order in a minute. The shop confirms on WhatsApp, and you collect it or have it brought to you."
              : "This shop is open. Nothing is listed on the page just yet."}
          </p>

          {products.length > 0 && (
            <>
              {/* Search earns its place once there is more here than fits on
                  one screen of a phone. Below that it is a box in the way. */}
              {products.length > 6 && (
                <label className="mt-5 flex h-12 items-center gap-2.5 rounded-full border-[1.5px] border-neutral-200 px-4 text-neutral-500 focus-within:border-teal">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                    <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={`Search ${businessName}`}
                    placeholder="What do you need?"
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-neutral-500 focus:outline-none"
                  />
                </label>
              )}

              {categories.length > 1 && (
                <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                  <Chip label="Everything" active={category === null} onClick={() => setCategory(null)} />
                  {categories.map((c) => (
                    <Chip key={c} label={c} active={category === c} onClick={() => setCategory(category === c ? null : c)} />
                  ))}
                </div>
              )}

              <h2 id="shop-all" className="mt-7 scroll-mt-20 font-heading text-[20px] font-extrabold text-ink-heading">
                {category ?? "Everything we sell"}
              </h2>

              {shown.length === 0 ? (
                <p className="py-14 text-center text-neutral-600">
                  Nothing here matches {query ? `"${query}"` : "that"}. Try another word.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4 lg:gap-5">
                  {shown.map((p) => (
                    <Tile key={p.id} product={p} inBasket={basket[p.id] ?? 0} onOpen={() => onOpen(p)} onAdd={() => onAdd(p)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Who you are buying from. A stranger who arrived from a forwarded
            link decides here whether to trust the shop. */}
        <aside className="flex flex-col gap-3.5">
          <div className="rounded-[20px] border border-neutral-100">
            <p className="px-4 pb-1.5 pt-3.5 font-heading text-[16px] font-bold text-ink-heading">Who you are buying from</p>
            <Fact k="Business" v={businessName} />
            {city && <Fact k="Where" v={`${city}, Ghana`} />}
            {since && <Fact k="On Ascend since" v={since} />}
            <Fact k="Your order" v="Confirmed by the shop on WhatsApp" />
            <Fact k="Getting it" v="Collect it, or the shop brings it to you" />
          </div>
          {places.length > 1 && (
            <div className="rounded-[20px] border border-neutral-100">
              <p className="px-4 pb-1.5 pt-3.5 font-heading text-[16px] font-bold text-ink-heading">Their shops</p>
              {places.map((pl, i) => (
                <Fact key={i} k={pl.name} v={pl.city ?? ""} />
              ))}
            </div>
          )}
          <p className="text-[12.5px] leading-relaxed text-neutral-600">
            The shop sets its prices and handles delivery, returns and support. Ascend runs the page and keeps it safe.
          </p>
          <ReportProblem source="shop" slug={slug} businessName={businessName} />
        </aside>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-neutral-100 px-4 py-2.5">
      <span className="text-[12.5px] text-neutral-600">{k}</span>
      <span className="text-[14px] font-semibold text-ink">{v}</span>
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
      className={`tap flex flex-none items-center whitespace-nowrap rounded-full border-[1.5px] px-4 text-[14px] font-semibold ${
        active ? "border-teal bg-teal text-white" : "border-neutral-200 bg-white text-ink"
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
  const soldOut = product.left === 0;
  const full = product.left !== undefined && inBasket >= product.left;
  return (
    <div className="relative">
      <div className="relative aspect-square w-full overflow-hidden rounded-[18px]">
        <Photo product={product} sizeHint="(min-width: 1024px) 240px, (min-width: 768px) 30vw, 45vw" />
        {soldOut && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-bold text-danger-ink">Sold out</span>
        )}

        {/* Adding is one tap from the grid. Opening the product is for
            somebody who wants to read before they commit, which is a
            different customer to the one restocking a weekly shop. It sits
            above the stretched open target so the two never fight. */}
        {!soldOut && (
        <button
          type="button"
          onClick={onAdd}
          disabled={full}
          aria-label={full ? `All the ${product.name} left are in your basket` : `Add ${product.name} to your basket`}
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
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-2 block w-full text-left"
      >
        {/* Stretched over the whole tile, so the photo opens the product
            without needing a second control that says the same thing. */}
        <span aria-hidden className="absolute inset-0" />
        <span className="block text-[14.5px] font-semibold leading-snug text-ink">
          {product.name}
        </span>
        <span className="num mt-0.5 block font-heading text-[16px] font-extrabold text-ink-heading">
          {formatShelfGHS(product.price)}
        </span>
        {product.left !== undefined && product.left > 0 && product.left <= 5 && (
          <span className="mt-0.5 block text-[12.5px] font-semibold text-gold-700">Only {product.left} left</span>
        )}
      </button>
    </div>
  );
}
