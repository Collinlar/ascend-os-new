import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/nav/workspace";
import { supabaseServer } from "@/lib/supabase";
import { riskNotice, CONTROL_FOR_BUSINESS, STATE_HEADLINE, STATE_MEANS } from "@/lib/risk/notice";
import { PageHeader, PageShell, Panel } from "@/components/shell/Page";
import AppealForm from "@/components/risk/AppealForm";

export const dynamic = "force-dynamic";

// Your business's standing with Ascend (Risk and Trust R5, spec 14).
//
// Shown only when Ascend has limited the business: what is limited, since
// when, in plain words why, and how to appeal. Anyone on the team can read
// it, because a cashier refused a refund deserves to know why. Only the
// owner can appeal.

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

async function isOwner(personId: string, businessId: string) {
  const { data } = await supabaseServer()
    .from("business_membership")
    .select("role:role_id(key)")
    .eq("person_id", personId)
    .eq("business_id", businessId)
    .eq("status", "active")
    .maybeSingle();
  return (data?.role as unknown as { key: string } | null)?.key === "owner";
}

export default async function Standing() {
  const workspace = await currentWorkspace();
  if (!workspace) redirect("/signin");

  const [notice, owner] = await Promise.all([
    riskNotice(workspace.businessId),
    isOwner(workspace.personId, workspace.businessId),
  ]);

  if (!notice) {
    return (
      <PageShell>
        <PageHeader title="Your standing with Ascend" />
        <Panel className="px-5 py-5">
          <p className="text-[15px] font-bold text-ink">Nothing on {workspace.businessName} is limited.</p>
          <p className="mt-1 text-sm font-medium text-slate-grey">
            If Ascend ever pauses something on your business, this page tells you what, why, and how to appeal.
          </p>
          <Link href="/dashboard" className="tap mt-3 inline-flex min-h-[44px] items-center text-sm font-bold text-teal-dark">
            Back to today
          </Link>
        </Panel>
      </PageShell>
    );
  }

  const { state, since, message, restrictions, appeal, canAppeal } = notice;

  return (
    <PageShell>
      <PageHeader title={STATE_HEADLINE[state]} intro={`Since ${DATE.format(new Date(since))}.`} />

      <div className="flex flex-col gap-6">
        <Panel className="px-5 py-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-slate-grey">Why</h2>
          <p className="mt-1 text-[15px] font-semibold text-ink">{message}</p>
          <p className="mt-2 text-sm font-medium text-slate-grey">
            A person at Ascend made this decision. Nothing here was switched on by a machine.
          </p>
        </Panel>

        <section aria-labelledby="limited">
          <h2 id="limited" className="mb-3 text-base font-bold text-ink">
            What this means
          </h2>
          <Panel>
            {state === "restricted" ? (
              restrictions.map((r, i) => {
                const c = CONTROL_FOR_BUSINESS[r.control];
                return (
                  <div key={r.control} className={`px-5 py-4 ${i < restrictions.length - 1 ? "border-b border-line-soft" : ""}`}>
                    <p className="text-[15px] font-bold text-ink">Paused: {c?.what ?? r.control}</p>
                    {c && <p className="mt-0.5 text-sm font-medium text-slate-grey">{c.still}</p>}
                  </div>
                );
              })
            ) : null}
            <div className={`px-5 py-4 ${state === "restricted" && restrictions.length ? "border-t border-line-soft" : ""}`}>
              <p className="text-sm font-medium text-ink">{STATE_MEANS[state]}</p>
            </div>
          </Panel>
        </section>

        <section aria-labelledby="appeal">
          <h2 id="appeal" className="mb-3 text-base font-bold text-ink">
            Appeal
          </h2>
          {appeal?.status === "open" ? (
            <Panel className="px-5 py-5">
              <p className="text-[15px] font-bold text-ink">Your appeal is with Ascend.</p>
              <p className="mt-1 text-sm font-medium text-slate-grey">
                Sent {DATE.format(new Date(appeal.submitted_at))}. A person who did not make the first decision reads it.
                The answer shows here.
              </p>
            </Panel>
          ) : (
            <>
              {appeal?.status === "declined" && appeal.decision_note && (
                <Panel className="mb-3 px-5 py-5">
                  <p className="text-[15px] font-bold text-ink">
                    Ascend answered your last appeal{appeal.decided_at ? ` on ${DATE.format(new Date(appeal.decided_at))}` : ""}.
                  </p>
                  <p className="mt-1 text-sm font-medium text-ink">&ldquo;{appeal.decision_note}&rdquo;</p>
                  <p className="mt-1 text-sm font-medium text-slate-grey">You can appeal again with more to show.</p>
                </Panel>
              )}
              {canAppeal && owner ? (
                <AppealForm businessId={workspace.businessId} />
              ) : (
                <Panel className="px-5 py-5">
                  <p className="text-sm font-medium text-ink">
                    Only the owner of {workspace.businessName} can appeal. Let them know this page is here.
                  </p>
                </Panel>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
