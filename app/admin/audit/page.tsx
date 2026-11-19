import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// The audit log, read only (D7 plan, decision 5): who did what, to which
// business, and when. Filtered by business name, the kind of action, and a
// date range. The newest 200 that match.

const LIMIT = 200;

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** The detail as short "key: value" pairs, never raw JSON. */
function said(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  return Object.entries(detail as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60)}`)
    .join(" · ");
}

export default async function Audit({ searchParams }: { searchParams: { q?: string; action?: string; from?: string; to?: string } }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  const q = (searchParams.q ?? "").trim();
  const action = (searchParams.action ?? "").trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from ?? "") ? searchParams.from : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to ?? "") ? searchParams.to : "";

  const db = supabaseServer();
  let ids: string[] | null = null;
  if (q) {
    const { data } = await db.from("business").select("id").ilike("name", `%${q}%`).limit(50);
    ids = (data ?? []).map((b) => b.id as string);
  }

  let rows: Array<Record<string, unknown>> = [];
  if (!ids || ids.length > 0) {
    let query = db
      .from("audit_log")
      .select("id, created_at, action, entity_type, detail, business:business_id(name), actor:actor_person_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (ids) query = query.in("business_id", ids);
    if (action) query = query.like("action", `${action}%`);
    if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59Z`);
    const { data } = await query;
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }

  // The kinds of action to narrow by, from what has actually been recorded.
  const { data: recent } = await db.from("audit_log").select("action").order("created_at", { ascending: false }).limit(2000);
  const kinds = Array.from(new Set((recent ?? []).map((r) => (r.action as string).split(/[.:]/)[0]))).sort();

  const field =
    "h-11 rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[15px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

  return (
    <PageShell>
      <PageHeader title="Audit" intro="Who did what, to which business, and when. Read only." />

      <form action="/admin/audit" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[12.5px] font-semibold text-neutral-700">
          Business
          <input name="q" defaultValue={q} placeholder="Business name" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-neutral-700">
          Kind
          <select name="action" defaultValue={action} className={field}>
            <option value="">Everything</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-neutral-700">
          From
          <input type="date" name="from" defaultValue={from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-neutral-700">
          To
          <input type="date" name="to" defaultValue={to} className={field} />
        </label>
        <button type="submit" className="tap flex h-11 items-center rounded-control bg-teal px-4 text-[14px] font-bold text-white">
          Show these
        </button>
        {(q || action || from || to) && (
          <Link href="/admin/audit" className="tap flex h-11 items-center px-2 text-[14px] font-semibold text-teal-800">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Nothing in the log matches that." detail="Widen the dates or clear the filters." />
      ) : (
        <Panel>
          {rows.map((r, i) => {
            const biz = (r.business as { name: string } | null)?.name;
            const who = (r.actor as { full_name: string } | null)?.full_name;
            return (
              <div key={r.id as number} className={`flex flex-col gap-0.5 px-5 py-3 text-[13.5px] ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="mono text-[13px] font-semibold text-ink">{r.action as string}</span>
                  <span className="num text-[12.5px] text-neutral-600">{when(r.created_at as string)}</span>
                </span>
                <span className="text-neutral-700">
                  {[biz ?? "No business", who ? `by ${who}` : null, r.entity_type ? `on ${(r.entity_type as string).replace(/_/g, " ")}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {said(r.detail) && <span className="break-words text-[12.5px] text-neutral-600">{said(r.detail)}</span>}
              </div>
            );
          })}
        </Panel>
      )}
      {rows.length === LIMIT && <p className="mt-3 text-[12.5px] text-neutral-600">The newest {LIMIT}. Narrow the filters to see further back.</p>}
    </PageShell>
  );
}
