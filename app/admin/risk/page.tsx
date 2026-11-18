import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import RiskReports, { type ReportRow } from "@/components/admin/RiskReports";
import RiskAppeals, { type AppealRow } from "@/components/admin/RiskAppeals";
import OpenCase from "@/components/admin/OpenCase";
import { DOMAIN_LABEL, STATE_LABEL } from "@/lib/risk/desk";

export const dynamic = "force-dynamic";

// The Risk desk (Risk and Trust R4 to R6, spec 09 and 11).
//
// In the order things wait on a person: a suspension or termination
// waiting for a second admin, appeals (a business is limited while it
// waits), open cases, customer reports, then the signals. Neither reports
// nor signals act by themselves: a case is opened from them, and every
// decision is made and written down on the case.

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
  domain: string;
  figures: Record<string, unknown>;
}

interface CaseRow {
  id: string;
  business_id: string;
  domain: string;
  trigger: string;
  status: string;
  requested_state: string | null;
  requested_by: string | null;
  opened_at: string;
  business: { name: string } | null;
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

async function load(adminPersonId: string) {
  const db = supabaseServer();
  const [appeals, reports, signals, cases, states] = await Promise.all([
    db.rpc("open_risk_appeals"),
    db.rpc("open_customer_reports"),
    db.rpc("risk_signals"),
    db
      .from("risk_case")
      .select("id, business_id, domain, trigger, status, requested_state, requested_by, opened_at, business:business_id(name)")
      .neq("status", "resolved")
      .order("opened_at", { ascending: false }),
    db.from("business_risk").select("business_id, state"),
  ]);
  if (appeals.error || reports.error || signals.error || cases.error) throw new Error("risk desk");
  const stateOf = new Map(((states.data ?? []) as Array<{ business_id: string; state: string }>).map((s) => [s.business_id, s.state]));
  return {
    cases: (cases.data ?? []) as unknown as CaseRow[],
    stateOf,
    appeals: ((appeals.data ?? []) as Array<{
      appeal_id: string;
      business_name: string;
      state_appealed: string;
      appeal_text: string;
      submitted_at: string;
      made_by: string | null;
    }>).map(
      (a): AppealRow => ({
        appealId: a.appeal_id,
        businessName: a.business_name,
        stateAppealed: a.state_appealed,
        appealText: a.appeal_text,
        submittedAt: a.submitted_at,
        madeByYou: a.made_by === adminPersonId,
      })
    ),
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

  const data = await load(admin.personId).catch(() => null);
  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Risk" />
        <EmptyState title="We could not load the risk desk just now." detail="Nothing has changed. Refresh in a moment." />
      </PageShell>
    );
  }
  const { appeals, reports, signals, cases, stateOf } = data;
  const waiting = cases.filter((c) => c.status === "awaiting_confirmation");
  const open = cases.filter((c) => c.status !== "awaiting_confirmation");
  const caseFor = new Map(cases.map((c) => [c.business_id, c.id]));
  const canAct = admin.role === "admin";

  return (
    <PageShell>
      <PageHeader
        title="Risk"
        intro={
          waiting.length > 0
            ? `${waiting.length} ${waiting.length === 1 ? "request is" : "requests are"} waiting for a second admin.`
            : appeals.length > 0
            ? `${appeals.length} ${appeals.length === 1 ? "business is" : "businesses are"} waiting on an appeal.`
            : reports.length > 0
            ? `${reports.length} customer ${reports.length === 1 ? "report is" : "reports are"} waiting to be read.`
            : "Cases, appeals, customer reports and signals. Nothing limits a business until an admin decides it on a case."
        }
      />

      {waiting.length > 0 && (
        <section aria-labelledby="second-admin" className="mb-8">
          <h2 id="second-admin" className="mb-3 text-base font-bold text-ink">
            Waiting for a second admin
          </h2>
          <Panel>
            {waiting.map((c, i) => (
              <Link
                key={c.id}
                href={`/admin/risk/cases/${c.id}`}
                className={`tap block border-l-4 border-l-gold-rule px-5 py-4 hover:bg-light-grey ${i < waiting.length - 1 ? "border-b border-line-soft" : ""}`}
              >
                <p className="text-[15px] font-bold text-ink">{c.business?.name}</p>
                <p className="mt-0.5 text-sm font-semibold text-gold-ink">
                  {c.requested_by === admin.personId ? "You asked" : "Asked"} to {c.requested_state === "terminated" ? "terminate" : "suspend"}
                  {c.requested_by === admin.personId ? ". Another admin confirms it." : ". Confirm or decline it."}
                </p>
              </Link>
            ))}
          </Panel>
        </section>
      )}

      <section aria-labelledby="appeals">
        <h2 id="appeals" className="mb-3 text-base font-bold text-ink">
          Appeals
        </h2>
        <RiskAppeals appeals={appeals} canAct={canAct} />
      </section>

      <section aria-labelledby="cases" className="mt-8">
        <h2 id="cases" className="mb-3 text-base font-bold text-ink">
          Open cases
        </h2>
        {canAct && (
          <div className="mb-3">
            <OpenCase label="Open a case on a business" />
          </div>
        )}
        {open.length === 0 ? (
          <EmptyState title="No open cases." detail="Open one from a signal or a customer report, or on any business by name." />
        ) : (
          <Panel>
            {open.map((c, i) => {
              const st = stateOf.get(c.business_id) ?? "normal";
              return (
                <Link
                  key={c.id}
                  href={`/admin/risk/cases/${c.id}`}
                  className={`tap block px-5 py-4 hover:bg-light-grey ${i < open.length - 1 ? "border-b border-line-soft" : ""}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[15px] font-bold text-ink">{c.business?.name}</p>
                    <p className="text-sm font-medium text-slate-grey">{WHEN.format(new Date(c.opened_at))}</p>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-ink-slate">
                    {DOMAIN_LABEL[c.domain] ?? c.domain} · {STATE_LABEL[st]?.name ?? st}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-grey">{c.trigger}</p>
                </Link>
              );
            })}
          </Panel>
        )}
      </section>

      <section aria-labelledby="reports" className="mt-8">
        <h2 id="reports" className="mb-3 text-base font-bold text-ink">
          Customer reports
        </h2>
        <RiskReports reports={reports} canAct={canAct} />
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
                className={`px-5 py-4 ${i < signals.length - 1 ? "border-b border-line-soft" : ""}`}
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
                {canAct && (
                  <div className="mt-3">
                    {caseFor.has(s.business_id) ? (
                      <Link
                        href={`/admin/risk/cases/${caseFor.get(s.business_id)}`}
                        className="tap inline-flex min-h-[44px] items-center text-sm font-bold text-teal-dark"
                      >
                        Go to its open case
                      </Link>
                    ) : (
                      <OpenCase
                        preset={{
                          businessId: s.business_id,
                          businessName: s.business_name,
                          domain: s.domain,
                          trigger: `Signal, ${(SIGNAL_LABEL[s.signal] ?? s.signal).toLowerCase()}: ${s.detail}`,
                          evidence: { signal: s.signal, severity: s.severity, ...s.figures },
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </Panel>
        )}
      </section>
    </PageShell>
  );
}
