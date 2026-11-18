import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import RiskReports, { type ReportRow } from "@/components/admin/RiskReports";

export const dynamic = "force-dynamic";

// Risk (Risk and Trust R4; the full desk with cases, restrictions, appeals
// and the second admin's confirmation comes in R6).
//
// Customer reports first, because a person is waiting on each one. Then
// the signals: things in the figures worth a look. Neither acts by itself.

const SIGNAL_LABEL: Record<string, string> = {
  refund_rate: "Many refunds",
  reversal_rate: "Many till sales reversed",
  till_gaps: "Till gaps",
  shift_differences: "Shifts that did not count out",
  volume_spike: "Sudden jump in sales",
  large_sale: "A sale far above the usual",
  new_and_heavy: "New business, heavy volume",
  likely_duplicate: "Likely duplicate business",
  customer_reports: "Customer reports",
};

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-danger-tint text-danger-ink",
  medium: "bg-gold-tint text-gold-ink",
  low: "bg-light-grey text-ink-muted",
};

interface SignalRow {
  business_id: string;
  business_name: string;
  risk_state: string;
  signal: string;
  severity: string;
  detail: string;
}

async function load() {
  const db = supabaseServer();
  const [reports, signals] = await Promise.all([db.rpc("open_customer_reports"), db.rpc("risk_signals")]);
  if (reports.error || signals.error) throw new Error("risk desk");
  return {
    reports: ((reports.data ?? []) as Array<{
      report_id: string;
      business_name: string;
      source: string;
      reason: string;
      detail: string | null;
      number_ends: string | null;
      reported_at: string;
      open_case_id: string | null;
      reports_on_business: number;
    }>).map(
      (r): ReportRow => ({
        reportId: r.report_id,
        businessName: r.business_name,
        source: r.source,
        reason: r.reason,
        detail: r.detail,
        numberEnds: r.number_ends,
        reportedAt: r.reported_at,
        openCaseId: r.open_case_id,
        reportsOnBusiness: Number(r.reports_on_business),
      })
    ),
    signals: (signals.data ?? []) as SignalRow[],
  };
}

export default async function AdminRisk() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  const data = await load().catch(() => null);
  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Risk" />
        <EmptyState title="We could not load the risk desk just now." detail="Nothing has changed. Refresh in a moment." />
      </PageShell>
    );
  }
  const { reports, signals } = data;

  return (
    <PageShell>
      <PageHeader
        title="Risk"
        intro={
          reports.length > 0
            ? `${reports.length} customer ${reports.length === 1 ? "report is" : "reports are"} waiting to be read.`
            : "Customer reports and signals. Nothing here limits a business until an admin decides it should."
        }
      />

      <section aria-labelledby="reports">
        <h2 id="reports" className="mb-3 text-base font-bold text-ink">
          Customer reports
        </h2>
        <RiskReports reports={reports} canAct={admin.role === "admin"} />
      </section>

      <section aria-labelledby="signals" className="mt-8">
        <h2 id="signals" className="mb-3 text-base font-bold text-ink">
          Signals
        </h2>
        {signals.length === 0 ? (
          <EmptyState title="Nothing in the figures looks wrong." detail="Refunds, reversals, till gaps, spikes, duplicates and messaging show here." />
        ) : (
          <Panel>
            {signals.map((s, i) => (
              <div
                key={`${s.business_id}-${s.signal}`}
                className={`px-5 py-4 ${i < signals.length - 1 ? "border-b border-[#EEF3F7]" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[15px] font-bold text-ink">{s.business_name}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${SEVERITY_STYLE[s.severity] ?? ""}`}>
                    {s.severity}
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-ink-slate">
                  {SIGNAL_LABEL[s.signal] ?? (s.signal.startsWith("messaging_") ? "Messaging" : s.signal)}
                  {s.risk_state !== "normal" && `, ${s.risk_state}`}
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-grey">{s.detail}.</p>
              </div>
            ))}
          </Panel>
        )}
      </section>
    </PageShell>
  );
}
