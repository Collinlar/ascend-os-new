import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { ResultRow, SellerNote, ShopCard, type DiscoverRow } from "@/components/discover/DiscoverResults";

export const dynamic = "force-dynamic";

// Customer-facing Discover, on the v3 Discover design: a home screen to
// browse, and search. Every business and product opens the business's own
// shop, which is already its page.
//
// Left out from the design until they are real: editors' picks, the map,
// ratings and reviews, Verified and Trusted labels, saved shops, reserving
// for pickup and paying through Ascend (D5 plan, approved 19 November 2026).
//
// Promoted results are visibly marked as paid placement and never as a
// recommendation, endorsement or verification (DSC-002, PRI-006).

interface Category {
  slug: string;
  label: string;
}

// A customer page, not a till. The root layout locks zoom, which is right
// for a handheld being held in a queue and wrong for somebody reading a
// price on their own phone (WCAG 1.4.4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
};

export const metadata: Metadata = {
  title: "Discover · Shops and services near you",
  description: "Find Ghanaian businesses selling and booking on AscendSME. You buy from them directly.",
};

async function load(q?: string, city?: string, category?: string) {
  const db = supabaseServer();
  try {
    const [results, categories, places] = await Promise.all([
      db.rpc("discover_search", { p_query: q || null, p_city: city || null, p_category: category || null, p_limit: 48 }),
      // What a customer can actually narrow by. Only categories that have
      // something in them, named once each.
      db
        .from("discover_listing")
        .select("category, discover_category!inner(slug, label, sort_order)")
        .eq("status", "eligible")
        .not("category", "is", null),
      // The cities that have something on Discover, so the city choice only
      // offers places with shops in them.
      db.rpc("discover_search", { p_query: null, p_city: null, p_category: null, p_limit: 200 }),
    ]);

    const seen = new Map<string, { label: string; sort: number; n: number }>();
    for (const row of categories.data ?? []) {
      const c = row.discover_category as unknown as { slug: string; label: string; sort_order: number };
      if (!c) continue;
      const hit = seen.get(c.slug);
      if (hit) hit.n += 1;
      else seen.set(c.slug, { label: c.label, sort: c.sort_order, n: 1 });
    }
    const cities = Array.from(
      new Set(((places.data ?? []) as DiscoverRow[]).map((r) => r.city).filter((c): c is string => Boolean(c)))
    ).sort();

    return {
      rows: (results.data ?? []) as DiscoverRow[],
      // Busiest first, so the rail leads with the shelf most likely to have
      // what somebody came for, and the taxonomy's own order breaks ties.
      categories: Array.from(seen.entries())
        .sort((a, b) => b[1].n - a[1].n || a[1].sort - b[1].sort)
        .slice(0, 8)
        .map(([slug, v]) => ({ slug, label: v.label })),
      cities,
    };
  } catch {
    return { rows: [] as DiscoverRow[], categories: [] as Category[], cities: [] as string[] };
  }
}

/** One card per shop, from its listings: the first picture, how many things, what kinds. */
function shopsFrom(rows: DiscoverRow[]) {
  const byShop = new Map<string, { row: DiscoverRow; count: number; categories: Set<string> }>();
  for (const r of rows) {
    if (!r.shop_slug) continue;
    const hit = byShop.get(r.business_id);
    if (hit) {
      hit.count += 1;
      if (!hit.row.photo_url && r.photo_url) hit.row = { ...hit.row, photo_url: r.photo_url };
      if (r.category_label) hit.categories.add(r.category_label);
    } else {
      byShop.set(r.business_id, { row: r, count: 1, categories: new Set(r.category_label ? [r.category_label] : []) });
    }
  }
  return Array.from(byShop.values()).map((s) => ({ ...s, categories: Array.from(s.categories) }));
}

export default async function Discover({
  searchParams,
}: {
  searchParams: { q?: string; city?: string; category?: string };
}) {
  const { q, city, category } = searchParams;
  const { rows, categories, cities } = await load(q, city, category);
  const searching = Boolean(q || category);
  const place = city ?? "you";

  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...searchParams, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const query = params.toString();
    return query ? `/discover?${query}` : "/discover";
  };

  const chip = (active: boolean) =>
    `tap flex flex-none items-center whitespace-nowrap rounded-full border-[1.5px] px-4 text-[14px] font-semibold ${
      active ? "border-teal bg-teal text-white" : "border-neutral-200 bg-white text-ink hover:border-teal-brand"
    }`;

  const categoryLabel = categories.find((c) => c.slug === category)?.label;
  const shops = shopsFrom(rows).slice(0, 8);

  return (
    <main className="min-h-screen bg-white text-ink">
      <header className="border-b border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 sm:px-8">
          <Link href="/discover" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ascendsme-logo.webp" alt="AscendSME" width={110} height={24} className="h-6 w-auto" />
            <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-teal-700">Discover</span>
          </Link>
          <form action="/discover" className="order-last flex h-12 min-w-0 flex-[1_1_100%] items-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white pl-4 pr-1.5 sm:order-none sm:flex-[1_1_400px] sm:max-w-[640px]">
            {category && <input type="hidden" name="category" value={category} />}
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="What do you need?"
              aria-label="Search shops and products"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-neutral-500 focus:outline-none"
            />
            <span aria-hidden className="h-6 w-px bg-neutral-200" />
            <select
              name="city"
              defaultValue={city ?? ""}
              aria-label="Which city"
              className="max-w-[9rem] bg-transparent text-[14px] font-semibold text-ink focus:outline-none"
            >
              <option value="">Anywhere</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="submit" className="tap flex h-10 flex-none items-center rounded-full bg-teal px-4 text-[14px] font-bold text-white">
              Find it
            </button>
          </form>
          <Link href="/" className="ml-auto text-[14px] font-semibold text-teal-800 hover:underline">
            List your business
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-7 sm:px-8">
        {!searching ? (
          <>
            {/* The design's home: a question to answer, the shelves that
                have something on them, then what is near. */}
            <section className="grid items-center gap-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3.5">
                <h1 className="font-heading text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-heading">
                  What do you need near {place} today?
                </h1>
                <p className="max-w-[520px] text-[17px] leading-relaxed text-neutral-600">
                  Real shops and service businesses on Ascend, with their own prices and stock. You buy from them directly.
                </p>
                {categories.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <Link key={c.slug} href={keep({ category: c.slug })} className={chip(false)}>
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-[24px] bg-teal-50 p-6 text-[14.5px] leading-relaxed text-teal-900">
                <p className="font-heading text-[18px] font-extrabold text-teal-900">How Discover works</p>
                <ul className="mt-2.5 flex flex-col gap-2">
                  <li>Every shop here sells on Ascend, and you order from the shop itself.</li>
                  <li>Anything marked Sponsored was paid for, and says so.</li>
                  <li>Something wrong with a shop? Report it from the shop&apos;s page. Our team reviews every report.</li>
                </ul>
              </div>
            </section>

            {shops.length > 0 && (
              <section className="mt-10 flex flex-col gap-3.5">
                <h2 className="font-heading text-[24px] font-extrabold text-ink-heading">Shops {city ? `in ${city}` : "on Discover"}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {shops.map((s) => (
                    <ShopCard key={s.row.business_id} row={s.row} count={s.count} categories={s.categories} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-10 max-w-3xl">
              <h2 className="font-heading text-[24px] font-extrabold text-ink-heading">{city ? `To buy near ${city}` : "To buy on Discover"}</h2>
              {rows.length === 0 ? (
                <p className="mt-3 text-[15px] text-neutral-600">Nothing on Discover {city ? `in ${city} ` : ""}yet. Try anywhere.</p>
              ) : (
                <div className="mt-2">
                  {rows.slice(0, 10).map((r) => (
                    <ResultRow key={`${r.listing_id}-${r.promoted}`} row={r} />
                  ))}
                </div>
              )}
              <SellerNote anyPromoted={rows.slice(0, 10).some((r) => r.promoted)} />
            </section>
          </>
        ) : (
          <section className="max-w-3xl">
            <h1 className="font-heading text-[26px] font-extrabold text-ink-heading">
              {q ? `“${q}”` : categoryLabel}
              {city ? ` near ${city}` : ""}
            </h1>
            <p className="mt-1 text-[13.5px] text-neutral-600">
              {rows.length === 0 ? "Nothing found" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}
            </p>
            {categories.length > 0 && (
              <div className="-mx-4 mt-3.5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                <Link href={keep({ category: undefined })} className={chip(!category)}>
                  Everything
                </Link>
                {categories.map((c) => (
                  <Link key={c.slug} href={keep({ category: c.slug })} className={chip(category === c.slug)}>
                    {c.label}
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3">
              {rows.length === 0 ? (
                <p className="border-t border-neutral-100 py-8 text-[15px] text-neutral-600">
                  Try a different word, or choose Anywhere to look in every city.
                </p>
              ) : (
                rows.map((r) => <ResultRow key={`${r.listing_id}-${r.promoted}`} row={r} />)
              )}
            </div>
            <SellerNote anyPromoted={rows.some((r) => r.promoted)} />
          </section>
        )}
      </div>
    </main>
  );
}
