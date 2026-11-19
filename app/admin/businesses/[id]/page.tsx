import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { PageHeader, PageShell, Panel } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// One business, as the Control Center sees it: who it is, what it runs on,
// how far it has come, and its risk state with the way to its case. Read
// only (D7 plan, decision 3). "View as this merchant" is deliberately not
// here (decision 6).

function day(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Never";
}

const RISK_TONE: Record<string, string> = {
  normal: "bg-success-tint text-success-ink",
  monitor: "bg-info-light text-info-ink",
  review: "bg-gold-100 text-gold-700",
  restricted: "bg-gold-100 text-gold-700",
  suspended: "bg-danger-tint text-danger-ink",
  terminated: "bg-danger-tint text-danger-ink",
};

export default async function BusinessPage({ params }: { params: { id: string } }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const db = supabaseServer();
  const { data: b } = await db
    .from("business")
    .select("id, name, created_at, status, status_reason, shop_slug, archetype, country_code")
    .eq("id", params.id)
    .maybeSingle();
  if (!b) notFound();

  const count = (t: string) => db.from(t).select("id", { count: "exact", head: true }).eq("business_id", b.id);
  const [locations, team, devices, products, customers, lastSale, risk, cases, ents] = await Promise.all([
    db.from("location").select("name, city, active").eq("business_id", b.id).order("created_at"),
    count("business_membership"),
    db.from("device_registration").select("label, status, last_sync_at").eq("business_id", b.id),
    db.from("catalogue_item").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("active", true),
    count("customer"),
    db.from("sale").select("occurred_at, total").eq("business_id", b.id).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("business_risk").select("state, case_id, changed_at").eq("business_id", b.id).maybeSingle(),
    db.from("risk_case").select("id, domain, status, created_at").eq("business_id", b.id).order("created_at", { ascending: false }).limit(5),
    db.from("entitlement").select("product_set_key, source, status, expires_at").eq("business_id", b.id).in("status", ["active", "grace"]).not("product_set_key", "is", null),
  ]);

  const state = (risk.data?.state as string | undefined) ?? "normal";
  const facts: [string, string][] = [
    ["Business ID", b.id as string],
    ["Joined", day(b.created_at as string)],
    ["Kind", ((b.archetype as string | null) ?? "Not said").replace(/_/g, " ")],
    ["Status", (b.status as string) + (b.status_reason ? `: ${b.status_reason}` : "")],
    ["Team", `${team.count ?? 0} ${team.count === 1 ? "person" : "people"}`],
    ["Products", `${products.count ?? 0} active`],
    ["Customers", `${customers.count ?? 0}`],
    ["Last sale", lastSale.data ? day(lastSale.data.occurred_at as string) : "Never"],
  ];

  return (
    <PageShell>
      <Link href="/admin/businesses" className="tap -mt-2 mb-2 inline-flex items-center text-[13.5px] font-semibold text-teal-800">
        All businesses
      </Link>
      <PageHeader title={b.name as string} intro={(locations.data ?? []).map((l) => l.city).filter(Boolean)[0] ?? undefined} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Who they are</h2>
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-neutral-100 px-5 py-2.5 text-[14px]">
                <span className="text-neutral-600">{k}</span>
                <span className={`text-right font-semibold text-ink ${k === "Business ID" ? "mono text-[12.5px]" : ""}`}>{v}</span>
              </div>
            ))}
            {b.shop_slug && (
              <div className="flex justify-between gap-4 border-t border-neutral-100 px-5 py-2.5 text-[14px]">
                <span className="text-neutral-600">Shop</span>
                <a href={`/s/${b.shop_slug}`} className="font-semibold text-teal-800 underline" target="_blank" rel="noreferrer">
                  /s/{b.shop_slug as string}
                </a>
              </div>
            )}
          </Panel>

          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">What they run on</h2>
            {(ents.data ?? []).length === 0 && <p className="border-t border-neutral-100 px-5 py-3 text-sm text-neutral-600">Nothing switched on.</p>}
            {(ents.data ?? []).map((e, i) => (
              <div key={i} className="flex justify-between gap-4 border-t border-neutral-100 px-5 py-2.5 text-[14px]">
                <span className="font-semibold text-ink">{e.product_set_key as string}</span>
                <span className="text-neutral-600">
                  {(e.source as string).replace(/_/g, " ")}
                  {e.status === "grace" ? ", in its grace period" : ""}
                  {e.expires_at ? `, until ${day(e.expires_at as string)}` : ""}
                </span>
              </div>
            ))}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">Risk</p>
            <span className={`mt-2 inline-block rounded-full px-3 py-1 text-[13px] font-bold ${RISK_TONE[state] ?? "bg-neutral-100 text-neutral-700"}`}>{state}</span>
            {risk.data?.changed_at && <p className="mt-2 text-[12.5px] text-neutral-600">Since {day(risk.data.changed_at as string)}</p>}
            {(cases.data ?? []).length > 0 ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {(cases.data ?? []).map((c) => (
                  <Link key={c.id as string} href={`/admin/risk/cases/${c.id}`} className="tap flex items-center justify-between rounded-control border border-line-brand px-3 text-[13.5px] hover:bg-neutral-50">
                    <span className="text-ink">{(c.domain as string).replace(/_/g, " ")}</span>
                    <span className="text-neutral-600">{(c.status as string).replace(/_/g, " ")}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-neutral-600">No risk cases.</p>
            )}
          </Panel>

          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Places</h2>
            {(locations.data ?? []).map((l, i) => (
              <div key={i} className="flex justify-between gap-4 border-t border-neutral-100 px-5 py-2.5 text-[14px]">
                <span className="text-ink">{l.name as string}</span>
                <span className="text-neutral-600">{(l.city as string | null) ?? ""}{l.active ? "" : " · closed"}</span>
              </div>
            ))}
          </Panel>

          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Tills</h2>
            {(devices.data ?? []).length === 0 && <p className="border-t border-neutral-100 px-5 py-3 text-sm text-neutral-600">No tills set up.</p>}
            {(devices.data ?? []).map((d, i) => (
              <div key={i} className="flex justify-between gap-4 border-t border-neutral-100 px-5 py-2.5 text-[14px]">
                <span className="text-ink">{d.label as string}</span>
                <span className="text-neutral-600">
                  {d.status as string}
                  {d.last_sync_at ? `, last sent ${day(d.last_sync_at as string)}` : ""}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
