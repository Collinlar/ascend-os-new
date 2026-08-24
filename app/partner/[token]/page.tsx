import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase";
import { hashShareToken } from "@/lib/sharing/share";
import { formatGHS } from "@/lib/money";

export const dynamic = "force-dynamic";

// What a bank, insurer or programme officer sees. Only the fields the
// business authorised, only for the period it authorised, with the
// limitations attached to the data rather than to the layout.

interface PartnerReport {
  report: {
    business_identity?: {
      name: string;
      country: string;
      archetype: string | null;
      identity_verification: string;
      legal_registration_status: string;
    };
    sustainability_score?: {
      value: number;
      computed_at: string;
      breakdown: { coverage?: number; provisional?: boolean };
    };
    evidence_confidence?: number;
    trust_level?: number;
    revenue_summary?: Array<{ month: string; revenue: number | null; refunds: number | null }>;
    document_summary?: { issued: number; paid: number; overdue: number };
    activity_summary?: {
      pos_sales: number;
      shop_orders_fulfilled: number;
      services_completed: number;
    };
  };
  scope: {
    authorized_fields: string[];
    period_from: string;
    period_to: string;
    expires_at: string | null;
    purpose: string | null;
  };
  limitations: string[];
}

async function load(token: string): Promise<PartnerReport | null> {
  try {
    const db = supabaseServer();
    // The accessor is recorded for the audit trail; a partner reading a
    // business's record is never anonymous to that business.
    const accessor =
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const { data, error } = await db.rpc("read_partner_report", {
      p_token_hash: hashShareToken(token),
      p_accessor: accessor,
    });
    if (error || !data) return null;
    return data as PartnerReport;
  } catch {
    return null;
  }
}

export default async function PartnerView({
  params,
}: {
  params: { token: string };
}) {
  const data = await load(params.token);
  if (!data) notFound();

  const identity = data.report.business_identity;
  const score = data.report.sustainability_score;

  return (
    <main className="min-h-screen bg-light-grey py-10">
      <div className="mx-auto max-w-2xl bg-white px-6 py-8">
        <p className="text-sm text-mid-grey">Shared business record</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">
          {identity?.name ?? "Business record"}
        </h1>
        {identity && (
          <p className="mt-1 text-sm text-mid-grey">
            {identity.country}
            {identity.archetype && ` · ${identity.archetype.replace(/_/g, " ")}`} ·
            identity {identity.identity_verification.replace(/_/g, " ")}
          </p>
        )}

        <p className="mt-4 border-l-2 border-line pl-3 text-sm text-mid-grey">
          Shared for: {data.scope.purpose ?? "no purpose stated"}. Covers{" "}
          {formatDate(data.scope.period_from)} to {formatDate(data.scope.period_to)}.
          {data.scope.expires_at &&
            ` Access ends ${formatDate(data.scope.expires_at)}.`}
        </p>

        {score && (
          <section className="mt-8 border border-line px-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-sm text-mid-grey">Sustainability Score</p>
                <p className="mt-1 text-3xl font-semibold text-ink">
                  {Number(score.value).toFixed(0)}
                  <span className="text-base text-mid-grey"> / 100</span>
                </p>
              </div>
              <div className="text-right text-sm text-mid-grey">
                {data.report.evidence_confidence !== undefined && (
                  <p>Evidence confidence {Number(data.report.evidence_confidence).toFixed(0)}%</p>
                )}
                {data.report.trust_level !== undefined && (
                  <p>Trust level {Number(data.report.trust_level).toFixed(0)}</p>
                )}
              </div>
            </div>
            {score.breakdown?.provisional && (
              <p className="mt-3 bg-gold-light px-3 py-2 text-sm text-gold-dark">
                Provisional. This business&apos;s record does not yet cover
                enough of its operations for the score to carry full weight.
              </p>
            )}
          </section>
        )}

        {data.report.revenue_summary && data.report.revenue_summary.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-mid-grey">Monthly revenue</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-mid-grey">
                  <th className="pb-2 font-medium">Month</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Refunds</th>
                </tr>
              </thead>
              <tbody>
                {data.report.revenue_summary.map((row) => (
                  <tr key={row.month} className="border-b border-line">
                    <td className="py-2 text-ink">{row.month}</td>
                    <td className="py-2 text-right text-ink">
                      {formatGHS(Number(row.revenue ?? 0))}
                    </td>
                    <td className="py-2 text-right text-mid-grey">
                      {formatGHS(Math.abs(Number(row.refunds ?? 0)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {(data.report.document_summary || data.report.activity_summary) && (
          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            {data.report.document_summary && (
              <div className="border border-line px-4 py-4">
                <p className="text-sm text-mid-grey">Documents</p>
                <p className="mt-1 text-ink">
                  {data.report.document_summary.issued} issued ·{" "}
                  {data.report.document_summary.paid} paid
                </p>
                {data.report.document_summary.overdue > 0 && (
                  <p className="text-sm text-gold-dark">
                    {data.report.document_summary.overdue} overdue
                  </p>
                )}
              </div>
            )}
            {data.report.activity_summary && (
              <div className="border border-line px-4 py-4">
                <p className="text-sm text-mid-grey">Activity</p>
                <p className="mt-1 text-ink">
                  {data.report.activity_summary.pos_sales} counter sales
                </p>
                <p className="text-sm text-mid-grey">
                  {data.report.activity_summary.shop_orders_fulfilled} orders ·{" "}
                  {data.report.activity_summary.services_completed} services
                </p>
              </div>
            )}
          </section>
        )}

        <section className="mt-10 border-t border-line pt-5">
          <h2 className="text-sm font-medium text-ink">Read this before deciding</h2>
          <ul className="mt-3 space-y-2">
            {data.limitations.map((limitation, i) => (
              <li key={i} className="text-sm text-mid-grey">
                {limitation}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-mid-grey">
            The business granted this access and can end it at any time. Every
            time this page is opened, it is recorded and visible to them.
          </p>
        </section>
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
