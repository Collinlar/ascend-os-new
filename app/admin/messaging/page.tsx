import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import MessagingDesk, { type DeletionRow, type LimitBusiness } from "@/components/admin/MessagingDesk";

export const dynamic = "force-dynamic";

// Messaging (Communications C5, spec 05 sections 9 and 13).
//
// Deletion requests first: a customer asked, and the law gives BVM 30
// days. Then what looks wrong, then how each business is messaging.

const FLAG_LABEL: Record<string, string> = {
  volume_spike: "Sudden jump in messages",
  high_opt_out: "Many customers opting out",
  high_failure: "Many messages failing",
  complaints: "Email marked as spam",
  bulk_to_unknown: "Marketing to numbers that are not customers",
  near_limit: "Close to the daily marketing limit",
};

interface SummaryRow {
  business_id: string;
  business_name: string;
  messages: number;
  marketing: number;
  cost: number;
  delivery_rate: number | null;
  opt_outs: number;
  refused_limit: number;
}

async function load() {
  const db = supabaseServer();
  const [requests, flags, summary, limits] = await Promise.all([
    db.rpc("open_deletion_requests"),
    db.rpc("messaging_flags"),
    db.rpc("messaging_summary", {}),
    db.from("business_messaging_limit").select("business_id, daily_marketing_cap, reason, updated_at"),
  ]);
  const caps = new Map(
    ((limits.data ?? []) as Array<{ business_id: string; daily_marketing_cap: number; reason: string; updated_at: string }>).map(
      (l) => [l.business_id, l]
    )
  );
  const rows = (summary.data ?? []) as SummaryRow[];
  return {
    requests: ((requests.data ?? []) as Array<{
      request_id: string;
      number_ends: string;
      requested_at: string;
      days_left: number;
      business_names: string[] | null;
    }>).map(
      (r): DeletionRow => ({
        requestId: r.request_id,
        numberEnds: r.number_ends,
        requestedAt: r.requested_at,
        daysLeft: r.days_left,
        businessNames: r.business_names ?? [],
      })
    ),
    flags: (flags.data ?? []) as Array<{ business_id: string; business_name: string; flag: string; detail: string }>,
    summary: rows,
    businesses: rows.map(
      (r): LimitBusiness => {
        const set = caps.get(r.business_id);
        return {
          businessId: r.business_id,
          name: r.business_name,
          cap: set?.daily_marketing_cap ?? 200,
          lastChange: set ? { reason: set.reason, at: set.updated_at } : null,
        };
      }
    ),
  };
}

const GHS = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });

export default async function AdminMessaging() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  const data = await load().catch(() => null);
  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Messaging" />
        <EmptyState
          title="We could not load the messaging desk just now."
          detail="Nothing has changed. Refresh in a moment."
        />
      </PageShell>
    );
  }

  const { requests, flags, summary, businesses } = data;

  return (
    <PageShell>
      <PageHeader
        title="Messaging"
        intro={
          requests.length > 0
            ? `${requests.length} ${requests.length === 1 ? "customer is" : "customers are"} waiting on a deletion.`
            : "Deletion requests, anything that looks wrong, and how each business is messaging."
        }
      />

      <MessagingDesk requests={requests} businesses={businesses} canAct={admin.role === "admin"} />

      <section aria-labelledby="flags" className="mt-8">
        <h2 id="flags" className="mb-3 text-base font-bold text-ink">
          What to look at
        </h2>
        {flags.length === 0 ? (
          <EmptyState title="Nothing looks wrong." detail="Spikes, opt-outs, failures, spam complaints and bulk sends show here." />
        ) : (
          <Panel>
            {flags.map((f, i) => (
              <div
                key={`${f.business_id}-${f.flag}`}
                className={`px-5 py-4 ${i < flags.length - 1 ? "border-b border-line-soft" : ""}`}
              >
                <p className="text-[15px] font-bold text-ink">{f.business_name}</p>
                <p className="mt-0.5 text-sm font-semibold text-gold-ink">{FLAG_LABEL[f.flag] ?? f.flag}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-grey">{f.detail}.</p>
              </div>
            ))}
          </Panel>
        )}
      </section>

      <section aria-labelledby="summary" className="mt-8">
        <h2 id="summary" className="mb-3 text-base font-bold text-ink">
          The last 30 days
        </h2>
        {summary.length === 0 ? (
          <EmptyState title="No business has sent a message in 30 days." />
        ) : (
          <Panel>
            {summary.map((s, i) => (
              <div
                key={s.business_id}
                className={`px-5 py-4 ${i < summary.length - 1 ? "border-b border-line-soft" : ""}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px] font-bold text-ink">{s.business_name}</p>
                  <p className="num text-sm font-bold text-ink">{GHS.format(Number(s.cost))}</p>
                </div>
                <p className="mt-0.5 text-sm font-medium text-slate-grey">
                  {s.messages} {s.messages === 1 ? "message" : "messages"}, {s.marketing} marketing
                  {s.delivery_rate !== null && `, ${Math.round(Number(s.delivery_rate) * 100)}% delivered`}
                  {s.opt_outs > 0 && `, ${s.opt_outs} opted out`}
                  {s.refused_limit > 0 && `, ${s.refused_limit} over the daily limit`}
                </p>
              </div>
            ))}
          </Panel>
        )}
      </section>
    </PageShell>
  );
}
