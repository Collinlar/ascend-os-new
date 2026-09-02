import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import DiscoverResults, {
  type DiscoverRow,
} from "@/components/discover/DiscoverResults";

export const dynamic = "force-dynamic";

// A chip on the rail: the slug the filter runs on, and the one name this
// category goes by however the merchant happened to type it.
interface Category {
  slug: string;
  label: string;
}

// Customer-facing Discover, on the Ascend Discover design.
//
// Promoted results are visibly marked as paid placement and never as a
// recommendation, endorsement or verification (DSC-002, PRI-006).

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
  description:
    "Find Ghanaian businesses selling and booking on AscendSME. You buy from them directly.",
};

async function search(q?: string, city?: string, category?: string) {
  const db = supabaseServer();
  try {
    const [results, categories] = await Promise.all([
      db.rpc("discover_search", {
        p_query: q || null,
        p_city: city || null,
        p_category: category || null,
        p_limit: 24,
      }),
      // What a customer can actually narrow by. Only categories that have
      // something in them, named once each: the taxonomy gives the label,
      // the live listings decide which chips are worth showing.
      db
        .from("discover_listing")
        .select("category, discover_category!inner(slug, label, sort_order)")
        .eq("status", "eligible")
        .not("category", "is", null),
    ]);

    const seen = new Map<string, { label: string; sort: number; n: number }>();
    for (const row of categories.data ?? []) {
      const c = row.discover_category as unknown as {
        slug: string;
        label: string;
        sort_order: number;
      };
      if (!c) continue;
      const hit = seen.get(c.slug);
      if (hit) hit.n += 1;
      else seen.set(c.slug, { label: c.label, sort: c.sort_order, n: 1 });
    }

    return {
      rows: (results.data ?? []) as DiscoverRow[],
      // Busiest first, so the rail leads with the shelf most likely to have
      // what somebody came for, and the taxonomy's own order breaks ties.
      categories: Array.from(seen.entries())
        .sort((a, b) => b[1].n - a[1].n || a[1].sort - b[1].sort)
        .slice(0, 8)
        .map(([slug, v]) => ({ slug, label: v.label })),
    };
  } catch {
    return { rows: [] as DiscoverRow[], categories: [] as Category[] };
  }
}

export default async function Discover({
  searchParams,
}: {
  searchParams: { q?: string; city?: string; category?: string };
}) {
  const { rows, categories } = await search(
    searchParams.q,
    searchParams.city,
    searchParams.category
  );

  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...searchParams, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const query = params.toString();
    return query ? `/discover?${query}` : "/discover";
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-5 sm:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.04em] text-ink-muted">
              DISCOVER
            </p>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">
              {searchParams.city ? `Made near ${searchParams.city}` : "Made near you"}
            </h1>
          </div>
          {searchParams.city && (
            <Link
              href={keep({ city: undefined })}
              className="tap flex flex-none items-center gap-1.5 rounded-chip border border-line bg-surface px-3 text-xs font-bold text-teal-dark"
            >
              {searchParams.city} ·<span className="font-extrabold">clear</span>
            </Link>
          )}
        </header>

        <form className="mt-3.5 flex gap-2" action="/discover">
          {searchParams.category && (
            <input type="hidden" name="category" value={searchParams.category} />
          )}
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search products, shops or brands"
            aria-label="Search Discover"
            className="min-w-0 flex-1 rounded-[14px] border border-line bg-surface px-4 font-medium text-ink outline-none placeholder:text-ink-muted focus:border-teal"
          />
          <input
            name="city"
            defaultValue={searchParams.city ?? ""}
            placeholder="City"
            aria-label="City"
            className="w-24 rounded-[14px] border border-line bg-surface px-3 font-medium text-ink outline-none placeholder:text-ink-muted focus:border-teal sm:w-32"
          />
          <button
            type="submit"
            className="tap flex flex-none items-center rounded-[14px] bg-ink px-5 font-bold text-white"
          >
            Search
          </button>
        </form>

        {categories.length > 0 && (
          <div className="scr -mx-5 mt-3.5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
            <Link
              href={keep({ category: undefined })}
              className={`tap flex flex-none items-center whitespace-nowrap rounded-chip border px-4 text-[13px] font-bold ${
                !searchParams.category
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink-muted"
              }`}
            >
              Everything
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={keep({ category: c.slug })}
                className={`tap flex flex-none items-center whitespace-nowrap rounded-chip border px-4 text-[13px] font-bold ${
                  searchParams.category === c.slug
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-ink-muted"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5">
          <DiscoverResults results={rows} />
        </div>
      </div>
    </main>
  );
}
