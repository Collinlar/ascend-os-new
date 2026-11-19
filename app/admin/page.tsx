import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { FigureRow, PageHeader, PageShell, Panel } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// The platform's own desk.
//
// Deliberately thin. Everything here is something Ascend does to a
// business rather than for one, so each of them should be easy to find,
// easy to explain, and hard to do by accident.

// The Overview's figures (0124). Null until that migration is applied, and
// the page then simply leaves the figures out.
async function figures(): Promise<{
  businesses: number;
  new_7d: number;
  with_products: number;
  first_sale: number;
  sold_7d: number;
  by_product: Record<string, number>;
} | null> {
  const { data, error } = await supabaseServer().rpc("control_center_figures");
  if (error || !data) return null;
  return data;
}

const PRODUCT: Record<string, string> = {
  pos: "POS",
  shop: "Shop",
  services: "Services",
  documents: "Documents",
  discover: "Discover",
  office: "Office",
};

async function counts() {
  const db = supabaseServer();
  const [appeals, suspended, listed] = await Promise.all([
    db
      .from("discover_listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspended")
      .not("appeal_note", "is", null),
    db
      .from("discover_listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspended"),
    db
      .from("discover_listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "eligible"),
  ]);
  return {
    appeals: appeals.count ?? 0,
    suspended: suspended.count ?? 0,
    listed: listed.count ?? 0,
  };
}

// What the messaging desk is waiting on: deletion requests and flags.
async function messagingCounts() {
  const db = supabaseServer();
  const [requests, flags] = await Promise.all([db.rpc("open_deletion_requests"), db.rpc("messaging_flags")]);
  return {
    deletions: Array.isArray(requests.data) ? requests.data.length : 0,
    flags: Array.isArray(flags.data) ? flags.data.length : 0,
  };
}

// What the risk page is waiting on: customer reports and signals.
async function riskCounts() {
  const db = supabaseServer();
  const [appeals, reports, signals] = await Promise.all([
    db.rpc("open_risk_appeals"),
    db.rpc("open_customer_reports"),
    db.rpc("risk_signals"),
  ]);
  return {
    riskAppeals: Array.isArray(appeals.data) ? appeals.data.length : 0,
    reports: Array.isArray(reports.data) ? reports.data.length : 0,
    signals: Array.isArray(signals.data) ? signals.data.length : 0,
  };
}

export default async function Admin() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  const [f, d, m, r] = await Promise.all([
    figures().catch(() => null),
    counts().catch(() => ({ appeals: 0, suspended: 0, listed: 0 })),
    messagingCounts().catch(() => ({ deletions: 0, flags: 0 })),
    riskCounts().catch(() => ({ riskAppeals: 0, reports: 0, signals: 0 })),
  ]);

  // What needs a person at Ascend, most pressing first. Each opens the desk
  // where it is decided.
  const needs = [
    { n: r.riskAppeals, one: "risk appeal to decide", many: "risk appeals to decide", href: "/admin/risk" },
    { n: r.reports, one: "customer report to review", many: "customer reports to review", href: "/admin/risk" },
    { n: m.deletions, one: "request to delete someone's data", many: "requests to delete people's data", href: "/admin/messaging" },
    { n: d.appeals, one: "Discover appeal", many: "Discover appeals", href: "/admin/discover" },
    { n: r.signals, one: "risk signal to look at", many: "risk signals to look at", href: "/admin/risk" },
    { n: m.flags, one: "messaging flag", many: "messaging flags", href: "/admin/messaging" },
  ].filter((x) => x.n > 0);

  const pct = (n: number) => (f && f.businesses > 0 ? `${Math.round((n / f.businesses) * 100)}% of all` : undefined);

  return (
    <PageShell>
      <PageHeader title="Overview" intro="What is happening across Ascend, and what needs one of us." />

      {f && (
        <FigureRow
          figures={[
            { label: "Businesses", value: f.businesses.toLocaleString("en-GH"), sub: `${f.new_7d} new this week` },
            { label: "Added products", value: f.with_products.toLocaleString("en-GH"), sub: pct(f.with_products) },
            { label: "Made a first sale", value: f.first_sale.toLocaleString("en-GH"), sub: pct(f.first_sale) },
            { label: "Sold this week", value: f.sold_7d.toLocaleString("en-GH"), sub: pct(f.sold_7d) },
          ]}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Needs one of us</h2>
          {needs.length === 0 ? (
            <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-600">Nothing is waiting. Every desk is clear.</p>
          ) : (
            needs.map((x) => (
              <Link
                key={x.one}
                href={x.href}
                className="tap flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3 hover:bg-neutral-50"
              >
                <span className="text-[14px] text-ink">
                  <span className="num font-bold">{x.n}</span> {x.n === 1 ? x.one : x.many}
                </span>
                <span className="text-[13px] font-bold text-teal-800">Open</span>
              </Link>
            ))
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          {f && Object.keys(f.by_product).length > 0 && (
            <Panel>
              <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Businesses by product</h2>
              {Object.entries(f.by_product)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([k, n]) => (
                  <div key={k} className="flex justify-between border-t border-neutral-100 px-5 py-2.5 text-[14px]">
                    <span className="text-neutral-700">{PRODUCT[k] ?? k}</span>
                    <span className="num font-semibold text-ink">{Number(n).toLocaleString("en-GH")}</span>
                  </div>
                ))}
            </Panel>
          )}
          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Discover</h2>
            <div className="flex justify-between border-t border-neutral-100 px-5 py-2.5 text-[14px]">
              <span className="text-neutral-700">Listed</span>
              <span className="num font-semibold text-ink">{d.listed}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-100 px-5 py-2.5 text-[14px]">
              <span className="text-neutral-700">Taken down</span>
              <span className="num font-semibold text-ink">{d.suspended}</span>
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
