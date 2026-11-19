import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// Businesses, by how far they have come: signed up, added products, made a
// first sale, sold this week (0124). Read only; changes happen at the desk
// that owns them (D7 plan, decision 3).

const STAGES: { key: string; label: string }[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "added_products", label: "Added products" },
  { key: "first_sale", label: "Made a first sale" },
  { key: "active", label: "Sold this week" },
];
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

interface Row {
  business_id: string;
  name: string;
  created_at: string;
  status: string;
  products: number;
  last_sale_at: string | null;
  sales_7d: number;
  product_sets: string[];
  stage: string;
}

const COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_150px_90px_130px_130px] lg:items-center lg:gap-4";

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never";
}

export default async function Businesses({ searchParams }: { searchParams: { stage?: string; q?: string } }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  const stage = STAGES.some((s) => s.key === searchParams.stage) ? searchParams.stage : undefined;
  const q = (searchParams.q ?? "").trim() || undefined;

  const db = supabaseServer();
  const [{ data, error }, all] = await Promise.all([
    db.rpc("control_center_businesses", { p_stage: stage ?? null, p_search: q ?? null, p_limit: 200 }),
    db.rpc("control_center_businesses", { p_stage: null, p_search: null, p_limit: 500 }),
  ]);
  const rows = (data ?? []) as Row[];
  const counts = new Map<string, number>();
  for (const r of (all.data ?? []) as Row[]) counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);

  const link = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("stage", s);
    if (q) p.set("q", q);
    const t = p.toString();
    return t ? `/admin/businesses?${t}` : "/admin/businesses";
  };

  return (
    <PageShell>
      <PageHeader title="Businesses" intro="Every business on Ascend, by how far it has come." />

      {error ? (
        <EmptyState title="The business list is not ready yet." detail="It needs 0124_control_center_figures.sql applied." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {STAGES.map((s) => (
              <Link
                key={s.key}
                href={link(stage === s.key ? undefined : s.key)}
                aria-current={stage === s.key ? "page" : undefined}
                className={`tap flex flex-col gap-[3px] rounded-panel border px-4 py-3.5 ${
                  stage === s.key ? "border-teal bg-teal-50" : "border-line-brand bg-white hover:border-teal-brand"
                }`}
              >
                <span className="text-xs text-neutral-600">{s.label}</span>
                <span className="num font-heading text-[21px] font-extrabold text-ink-heading">{(counts.get(s.key) ?? 0).toLocaleString("en-GH")}</span>
              </Link>
            ))}
          </div>

          <form action="/admin/businesses" className="mb-4 flex gap-2">
            {stage && <input type="hidden" name="stage" value={stage} />}
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Business name"
              aria-label="Find a business by name"
              className="h-11 min-w-0 flex-1 rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
            <button type="submit" className="tap flex items-center rounded-control bg-teal px-4 text-[14px] font-bold text-white">
              Find it
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState title="No business matches that." detail="Clear the name or pick another stage." />
          ) : (
            <Panel>
              <div aria-hidden className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${COLS}`}>
                <span>Business</span>
                <span>Stage</span>
                <span className="text-right">Products</span>
                <span>Last sale</span>
                <span>Joined</span>
              </div>
              {rows.map((r, i) => (
                <Link
                  key={r.business_id}
                  href={`/admin/businesses/${r.business_id}`}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] hover:bg-neutral-50 ${COLS} ${i > 0 ? "border-t border-neutral-100" : ""}`}
                >
                  <span className="flex min-w-0 basis-full flex-col lg:basis-auto">
                    <span className="truncate text-[14px] font-semibold text-ink">
                      {r.name}
                      {r.status !== "active" && <span className="ml-2 rounded-full bg-danger-tint px-2 py-0.5 text-[11px] font-bold text-danger-ink">{r.status}</span>}
                    </span>
                    <span className="truncate text-[12px] text-neutral-600">{r.product_sets.join(", ") || "No products switched on"}</span>
                  </span>
                  <span className="text-neutral-700">
                    <span className="sr-only">Stage: </span>
                    {STAGE_LABEL[r.stage] ?? r.stage}
                  </span>
                  <span className="num text-neutral-700 lg:text-right">
                    <span className="lg:hidden"> · </span>
                    <span className="sr-only">Products: </span>
                    {r.products}
                    <span className="lg:hidden"> products</span>
                  </span>
                  <span className="text-neutral-700">
                    <span className="lg:hidden"> · last sale </span>
                    <span className="sr-only">Last sale: </span>
                    {day(r.last_sale_at)}
                  </span>
                  <span className="hidden text-neutral-700 lg:block">
                    <span className="sr-only">Joined: </span>
                    {day(r.created_at)}
                  </span>
                </Link>
              ))}
            </Panel>
          )}
        </>
      )}
    </PageShell>
  );
}
