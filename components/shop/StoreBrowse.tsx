"use client";

import { useMemo, useState } from "react";
import { formatShelfGHS } from "@/lib/money";
import { Photo, type StorefrontProduct } from "./storefront-parts";
import ReportProblem from "@/components/risk/ReportProblem";
import { DEFAULT_SETTINGS, fulfilmentFacts, promoLive, type ShopSettings } from "@/lib/shop/settings";

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
  verified = false,
  bookable = false,
  settings = DEFAULT_SETTINGS,
  promoLink = null,
  services = [],
  serviceCount = 0,
  category: categoryProp,
  onCategory,
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
  verified?: boolean;
  bookable?: boolean;
  settings?: ShopSettings;
  promoLink?: { kind: "product" | "service"; id: string } | null;
  services?: Array<{ id: string; name: string; price: number; minutes: number | null; deposit: number | null }>;
  serviceCount?: number;
  /** The aisle, when the storefront holds it (round 4, S1). */
  category?: string | null;
  onCategory?: (c: string | null) => void;
}) {
  const facts = fulfilmentFacts(settings, places.length > 1 ? places.map((p) => p.name) : []);
  const promoProduct = promoLink?.kind === "product" ? products.find((p) => p.id === promoLink.id) ?? null : null;
  const [query, setQuery] = useState("");
  const [ownCategory, setOwnCategory] = useState<string | null>(null);
  const category = categoryProp !== undefined ? categoryProp : ownCategory;
  const setCategory = (c: string | null) => (onCategory ? onCategory(c) : setOwnCategory(c));
  // Search filters (round 2, R4): sort, a price ceiling, in stock.
  const [sort, setSort] = useState<"popular" | "low" | "high" | "new">("popular");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [inStock, setInStock] = useState(false);
  const priceOf = (p: StorefrontProduct) => (p.sizes?.length ? Math.min(...p.sizes.map((z) => z.price)) : p.price);
  // Ceilings that actually split this shop's list, so no chip empties it
  // or does nothing.
  const ceilings = useMemo(() => {
    const prices = products.map(priceOf);
    return [20, 50, 100, 200, 500, 1000].filter((c) => prices.some((x) => x <= c) && prices.some((x) => x > c)).slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);
  const counted = products.some((p) => p.left !== undefined);
  const filtering = maxPrice !== null || inStock || sort !== "popular";

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
    const list = products.filter((p) => {
      if (category && p.category !== category) return false;
      if (maxPrice !== null && priceOf(p) > maxPrice) return false;
      if (inStock && p.left === 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.sizes ?? []).some((z) => z.name.toLowerCase().includes(q))
      );
    });
    const sorted = [...list];
    if (sort === "low") sorted.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === "high") sorted.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sort === "new") sorted.sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""));
    else sorted.sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0));
    // Sold out last, whatever the order.
    return sorted.sort((a, b) => Number(a.left === 0) - Number(b.left === 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, category, sort, maxPrice, inStock]);

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
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-neutral-600">
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[12.5px] font-bold text-teal-800">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Verified business
              </span>
            )}
            <span>
              {[
                places.length > 1 ? places.map((pl) => pl.name).join(" and ") : city,
                categories.slice(0, 3).join(", "),
                products.length > 0 ? `${products.length} ${products.length === 1 ? "item" : "items"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-neutral-700">
            {products.length > 0
              ? `Pick what you need and order in a minute. The shop confirms on WhatsApp, and you ${
                  facts.pickup && facts.delivery ? "collect it or have it brought to you" : facts.delivery ? "have it brought to you" : "collect it"
                }.`
              : "This shop is open. Nothing is listed on the page just yet."}
          </p>

          {/* How it reaches you, said before anything is in the basket (R3). */}
          {settings.saved && (facts.pickup || facts.delivery) && (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {facts.pickup && <WayToGet title={facts.pickup.title} detail={facts.pickup.detail} />}
              {facts.delivery && <WayToGet title={facts.delivery.title} detail={facts.delivery.detail} />}
            </div>
          )}

          {/* The shop's one promotion (decision 5). */}
          {promoLive(settings) && (
            // @contrast-ignore white on the deep navy ground (#0F172A), 17:1
            <div className="mt-4 flex flex-col gap-1.5 rounded-[22px] bg-navy-deep px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-mint-bright">{settings.promo.headline}</span>
                {settings.promo.body && <span className="font-heading text-[17px] font-bold leading-snug">{settings.promo.body}</span>}
              </span>
              {promoLink?.kind === "service" && (
                <a href={`/b/${slug}`} className="tap mt-2 inline-flex min-h-[44px] flex-none items-center self-start rounded-full bg-white px-5 text-[14px] font-bold text-ink sm:mt-0 sm:self-auto">
                  Book now
                </a>
              )}
              {promoProduct && (
                <button type="button" onClick={() => onOpen(promoProduct)} className="tap mt-2 inline-flex min-h-[44px] flex-none items-center self-start rounded-full bg-white px-5 text-[14px] font-bold text-ink sm:mt-0 sm:self-auto">
                  See it
                </button>
              )}
            </div>
          )}

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

              {(categories.length > 1 || bookable) && (
                <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                  {categories.length > 1 && <Chip label="Everything" active={category === null} onClick={() => setCategory(null)} />}
                  {categories.length > 1 &&
                    categories.map((c) => <Chip key={c} label={c} active={category === c} onClick={() => setCategory(category === c ? null : c)} />)}
                  {/* Services are booked on their own page, with a time. */}
                  {bookable && (
                    <a
                      href={`/b/${slug}`}
                      className="tap flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-teal-200 bg-teal-50 px-4 text-[14px] font-semibold text-teal-800"
                    >
                      Book a service
                    </a>
                  )}
                </div>
              )}

              {/* On a laptop, the aisles as tiles with how much is in each
                  (round 4, S1). */}
              {category === null && !query.trim() && !filtering && categories.length > 1 && (
                <div className="mt-5 hidden gap-3 lg:grid lg:grid-cols-4">
                  {categories.slice(0, bookable ? 3 : 4).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className="tap flex flex-col items-start gap-1 rounded-[18px] border border-neutral-100 bg-teal-50 px-4 py-4 text-left hover:border-teal-brand"
                    >
                      <span className="font-heading text-[16px] font-bold text-ink-heading">{c}</span>
                      <span className="text-[13px] text-neutral-600">
                        {products.filter((p) => p.category === c).length} product{products.filter((p) => p.category === c).length === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                  {bookable && (
                    <a href={`/b/${slug}`} className="tap flex flex-col items-start gap-1 rounded-[18px] border border-neutral-100 bg-gold-light px-4 py-4 hover:border-teal-brand">
                      <span className="font-heading text-[16px] font-bold text-ink-heading">Book a service</span>
                      <span className="text-[13px] text-neutral-600">
                        {serviceCount} service{serviceCount === 1 ? "" : "s"}
                        {places.length > 1 ? `, ${places.length} locations` : ""}
                      </span>
                    </a>
                  )}
                </div>
              )}

              {products.length > 3 && (
                <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                  <label className="flex h-11 flex-none items-center gap-1.5 rounded-full border-[1.5px] border-neutral-200 bg-white pl-4 pr-2 text-[14px] font-semibold text-ink">
                    <span className="text-neutral-600">Sort</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as typeof sort)}
                      aria-label="Sort by"
                      className="h-full bg-transparent pr-1 font-semibold text-ink focus:outline-none"
                    >
                      <option value="popular">Popular</option>
                      <option value="low">Price, low to high</option>
                      <option value="high">Price, high to low</option>
                      <option value="new">Newest</option>
                    </select>
                  </label>
                  {ceilings.map((c) => (
                    <Chip key={c} label={`Under GHS ${c}`} active={maxPrice === c} onClick={() => setMaxPrice(maxPrice === c ? null : c)} />
                  ))}
                  {counted && <Chip label="In stock" active={inStock} onClick={() => setInStock(!inStock)} />}
                  {filtering && (
                    <button
                      type="button"
                      onClick={() => {
                        setSort("popular");
                        setMaxPrice(null);
                        setInStock(false);
                      }}
                      className="tap flex h-11 flex-none items-center px-2 text-[14px] font-semibold text-teal-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              <h2 id="shop-all" className="mt-7 scroll-mt-20 font-heading text-[20px] font-extrabold text-ink-heading">
                {category ?? (query.trim() || filtering ? `${shown.length} ${shown.length === 1 ? "result" : "results"}${query.trim() ? ` for "${query.trim()}"` : ""}` : "Everything we sell")}
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

          {/* Services are booked with a time on the booking page (R4). */}
          {services.length > 0 && (
            <section className="mt-9">
              <h2 className="font-heading text-[20px] font-extrabold text-ink-heading">Book with us</h2>
              <p className="mt-1 text-[14px] text-neutral-600">Pick a time on the booking page.</p>
              <div className="mt-3 flex flex-col rounded-[20px] border border-neutral-100">
                {services.map((sv) => (
                  <a key={sv.id} href={`/b/${slug}`} className="tap flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 hover:bg-teal-50">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[14.5px] font-bold text-ink">{sv.name}</span>
                      <span className="text-[12.5px] text-neutral-600">
                        {[
                          sv.minutes ? (sv.minutes >= 60 ? `${Math.round((sv.minutes / 60) * 10) / 10} hour${sv.minutes === 60 ? "" : "s"}` : `${sv.minutes} minutes`) : null,
                          sv.deposit ? `deposit ${formatShelfGHS(sv.deposit)} secures your slot` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Book a time"}
                      </span>
                    </span>
                    <span className="num flex-none text-[14px] font-extrabold text-ink">{formatShelfGHS(sv.price)}</span>
                    <span className="flex-none rounded-full bg-teal-50 px-3 py-1.5 text-[13px] font-bold text-teal-800">Book</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Why a stranger can trust this page: only what Ascend holds (R4). */}
          <div className="mt-9 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {verified && <Trust title="Verified business" detail="Checked by Ascend" />}
            <Trust title="Confirmed on WhatsApp" detail="Nothing moves until the shop confirms" />
            {settings.saved && facts.returns && <Trust title={settings.returnsDays ? `${settings.returnsDays}-day returns` : "Returns"} detail={settings.returnsNote || facts.returns} />}
            {settings.contactLine ? <Trust title="Real people" detail={settings.contactLine} /> : <Trust title="Pay on the day" detail="When you collect it or it reaches you" />}
          </div>
        </div>

        {/* Who you are buying from. A stranger who arrived from a forwarded
            link decides here whether to trust the shop. */}
        <aside className="flex flex-col gap-3.5">
          <div className="rounded-[20px] border border-neutral-100">
            <p className="px-4 pb-1.5 pt-3.5 font-heading text-[16px] font-bold text-ink-heading">Who you are buying from</p>
            <Fact k="Business" v={businessName} />
            {verified && <Fact k="Checked by Ascend" v="Who runs this business has been verified" />}
            {city && <Fact k="Where" v={`${city}, Ghana`} />}
            {since && <Fact k="On Ascend since" v={since} />}
            <Fact k="Your order" v="Confirmed by the shop on WhatsApp" />
            {settings.saved ? (
              <>
                {facts.pickup && <Fact k={facts.pickup.title} v={facts.pickup.detail} />}
                {facts.delivery && <Fact k={facts.delivery.title} v={[facts.delivery.detail, settings.deliveryNote].filter(Boolean).join(". ")} />}
                {facts.returns && <Fact k="Returns" v={facts.returns} />}
                {settings.contactLine && <Fact k="Reach them" v={settings.contactLine} />}
              </>
            ) : (
              <Fact k="Getting it" v="Collect it, or the shop brings it to you" />
            )}
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
        {!soldOut && product.bestseller && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-teal-100 px-2.5 py-1 text-[12px] font-bold text-teal-800">Best seller</span>
        )}
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
          {product.sizes?.length ? "from " : ""}
          {formatShelfGHS(product.sizes?.length ? Math.min(...product.sizes.map((z) => z.price)) : product.price)}
        </span>
        {product.left !== undefined && product.left > 0 && product.left <= 5 && (
          <span className="mt-0.5 block text-[12.5px] font-semibold text-gold-700">Only {product.left} left</span>
        )}
      </button>
    </div>
  );
}

function WayToGet({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[16px] border border-neutral-100 bg-teal-50 px-4 py-3">
      <span className="text-[14px] font-bold text-teal-800">{title}</span>
      <span className="text-[13px] text-neutral-700">{detail}</span>
    </div>
  );
}

function Trust({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[16px] bg-neutral-50 px-3.5 py-3">
      <span className="text-[13.5px] font-bold text-ink">{title}</span>
      <span className="text-[12.5px] leading-snug text-neutral-600">{detail}</span>
    </div>
  );
}
