import { supabaseServer } from "@/lib/supabase";
import DiscoverResults, {
  type DiscoverRow,
} from "@/components/discover/DiscoverResults";

export const dynamic = "force-dynamic";

// Customer-facing Discover. Promoted results are visibly marked as paid
// placement and never as a recommendation, endorsement or verification
// (DSC-002, PRI-006).

async function search(q?: string, city?: string): Promise<DiscoverRow[]> {
  try {
    const db = supabaseServer();
    const { data } = await db.rpc("discover_search", {
      p_query: q || null,
      p_city: city || null,
      p_category: null,
      p_limit: 20,
    });
    return (data ?? []) as DiscoverRow[];
  } catch {
    return [];
  }
}

export default async function Discover({
  searchParams,
}: {
  searchParams: { q?: string; city?: string };
}) {
  const results = await search(searchParams.q, searchParams.city);

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-line">
        <div className="mx-auto max-w-2xl px-5 py-6">
          <h1 className="text-2xl font-semibold leading-display text-ink">
            Find a business near you
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Shops and services running on AscendSME. You buy from them
            directly, not from us.
          </p>

          <form className="mt-5 flex gap-2" action="/discover">
            <input
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder="What are you looking for?"
              className="flex-1 border border-line px-4 py-3 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <input
              name="city"
              defaultValue={searchParams.city ?? ""}
              placeholder="City"
              className="w-28 border border-line px-3 py-3 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <button
              type="submit"
              className="tap bg-teal px-5 font-medium text-white"
            >
              Search
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        <DiscoverResults results={results} />
      </div>
    </main>
  );
}
