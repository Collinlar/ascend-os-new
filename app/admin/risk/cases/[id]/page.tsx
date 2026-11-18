import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import RiskCaseDesk, { type CaseView } from "@/components/admin/RiskCaseDesk";
import { CONTROL_LABEL, DOMAIN_LABEL, EVENT_LABEL, STATE_LABEL, stateNow } from "@/lib/risk/desk";

export const dynamic = "force-dynamic";

// One risk case (Risk and Trust R6). What started it, where the business
// stands, what is paused, what the business is told, and every step anyone
// took, with who took it. The controls sit above the history; the history
// cannot be edited.

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Evidence is a snapshot of whatever opened the case (a signal's figures,
// a customer report); shown one fact a line.
function flatten(o: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, prefix + k + " ")
      : [[prefix + k, v === null ? "none" : String(v)] as [string, string]]
  );
}

async function load(id: string) {
  const db = supabaseServer();
  const { data: c, error } = await db
    .from("risk_case")
    .select("id, business_id, domain, trigger, evidence, status, opened_by, opened_at, requested_state, requested_by, requested_reason, resolution, resolved_at, business_message, business:business_id(name, status, shop_slug)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const [risk, events, restrictions, appeals, reports] = await Promise.all([
    db.from("business_risk").select("state").eq("business_id", c.business_id).maybeSingle(),
    db.from("risk_case_event").select("id, action, from_state, to_state, detail, by_person_id, at").eq("case_id", id).order("at", { ascending: false }),
    db.from("business_restriction").select("control, reason, set_at, case_id").eq("business_id", c.business_id).is("lifted_at", null),
    db.from("risk_appeal").select("id, status, appeal_text, submitted_at, decision_note").eq("case_id", id).order("submitted_at", { ascending: false }),
    db.from("customer_report").select("id, reason, detail, created_at").eq("case_id", id).order("created_at", { ascending: false }),
  ]);
  if (events.error || restrictions.error) throw new Error("case");

  const ids = Array.from(new Set([c.opened_by, c.requested_by, ...(events.data ?? []).map((e) => e.by_person_id)].filter(Boolean))) as string[];
  const { data: people } = ids.length
    ? await db.from("person").select("id, full_name").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name as string]));

  return { c, state: (risk.data?.state as string | undefined) ?? "normal", events: events.data ?? [], restrictions: restrictions.data ?? [], appeals: appeals.data ?? [], reports: reports.data ?? [], name };
}

export default async function RiskCase({ params }: { params: { id: string } }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();

  const data = await load(params.id).catch(() => undefined);
  if (data === null) notFound();
  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Risk case" />
        <EmptyState title="We could not load this case just now." detail="Nothing has changed. Refresh in a moment." />
      </PageShell>
    );
  }
  const { c, state, events, restrictions, appeals, reports, name } = data;
  const business = c.business as unknown as { name: string; status: string; shop_slug: string | null };
  const who = (id: string | null) => (id ? (id === admin.personId ? "you" : name.get(id) ?? "an admin") : "");

  const view: CaseView = {
    caseId: c.id,
    businessName: business.name,
    status: c.status as CaseView["status"],
    state,
    requested: c.status === "awaiting_confirmation"
      ? { state: c.requested_state as string, reason: c.requested_reason as string, by: who(c.requested_by), byYou: c.requested_by === admin.personId }
      : null,
    restrictions: restrictions.map((r) => r.control as string),
    businessMessage: (c.business_message as string | null) ?? null,
    canAct: admin.role === "admin",
  };

  const evidence = c.evidence && typeof c.evidence === "object" && Object.keys(c.evidence).length ? (c.evidence as Record<string, unknown>) : null;

  return (
    <PageShell>
      <Link href="/admin/risk" className="tap mb-2 inline-flex min-h-[44px] items-center text-sm font-bold text-teal-dark">
        Back to Risk
      </Link>
      <PageHeader
        title={business.name}
        intro={`${DOMAIN_LABEL[c.domain] ?? c.domain}. Opened ${WHEN.format(new Date(c.opened_at))} by ${who(c.opened_by)}.`}
      />

      <div className="flex flex-col gap-6">
        <Panel className="px-5 py-4">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-slate-grey">What started it</p>
          <p className="mt-1 whitespace-pre-line text-[15px] font-semibold text-ink">{c.trigger}</p>
          {evidence && (
            <div className="mt-2 text-xs font-medium text-slate-grey">
              <p>Evidence kept with the case:</p>
              <ul className="mt-0.5">
                {flatten(evidence).map(([k, v]) => (
                  <li key={k} className="break-words">
                    {k.replace(/_/g, " ")}: {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-sm font-medium text-ink">
            The business is <span className="font-bold">{STATE_LABEL[state]?.name ?? state}</span>
            {business.status !== "active" && business.status !== state && `, and ${business.status} on Ascend`}.{" "}
            {c.status === "resolved"
              ? `This case was closed ${c.resolved_at ? WHEN.format(new Date(c.resolved_at)) : ""}: ${c.resolution}`
              : stateNow(state)}
          </p>
          {restrictions.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {restrictions.map((r) => (
                <li key={r.control} className="text-sm font-medium text-ink">
                  Paused: {CONTROL_LABEL[r.control] ?? r.control}
                  {r.case_id !== c.id && <span className="text-slate-grey"> (from another case)</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <RiskCaseDesk view={view} />

        {(appeals.length > 0 || reports.length > 0) && (
          <section aria-labelledby="from-outside">
            <h2 id="from-outside" className="mb-3 text-base font-bold text-ink">
              From the business and its customers
            </h2>
            <Panel>
              {appeals.map((a, i) => (
                <div key={a.id} className={`px-5 py-4 ${i < appeals.length + reports.length - 1 ? "border-b border-line-soft" : ""}`}>
                  <p className="text-sm font-semibold text-gold-ink">
                    Appeal, {a.status}, {WHEN.format(new Date(a.submitted_at))}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">&ldquo;{a.appeal_text}&rdquo;</p>
                  {a.decision_note && <p className="mt-1 text-sm font-medium text-slate-grey">Answer: {a.decision_note}</p>}
                  {a.status === "open" && (
                    <Link href="/admin/risk" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-teal-dark">
                      Answer it on the Risk page
                    </Link>
                  )}
                </div>
              ))}
              {reports.map((r, i) => (
                <div key={r.id} className={`px-5 py-4 ${appeals.length + i < appeals.length + reports.length - 1 ? "border-b border-line-soft" : ""}`}>
                  <p className="text-sm font-semibold text-gold-ink">Customer report, {WHEN.format(new Date(r.created_at))}</p>
                  {r.detail && <p className="mt-1 whitespace-pre-line text-sm text-ink">&ldquo;{r.detail}&rdquo;</p>}
                </div>
              ))}
            </Panel>
          </section>
        )}

        <section aria-labelledby="history">
          <h2 id="history" className="mb-3 text-base font-bold text-ink">
            History
          </h2>
          <Panel>
            {events.map((e, i) => (
              <div key={e.id} className={`px-5 py-3 ${i < events.length - 1 ? "border-b border-line-soft" : ""}`}>
                <p className="text-sm font-bold text-ink">
                  {EVENT_LABEL[e.action] ?? e.action}
                  {e.action.startsWith("restriction") && e.to_state ? `: ${CONTROL_LABEL[e.to_state] ?? e.to_state}` : ""}
                  {["state_changed", "state_requested", "state_confirmed", "state_declined"].includes(e.action) && e.to_state
                    ? `: ${STATE_LABEL[e.to_state]?.name ?? e.to_state}`
                    : ""}
                </p>
                {e.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{e.detail}</p>}
                <p className="mt-0.5 text-xs font-medium text-slate-grey">
                  {who(e.by_person_id)}, {WHEN.format(new Date(e.at))}
                </p>
              </div>
            ))}
          </Panel>
        </section>
      </div>
    </PageShell>
  );
}
