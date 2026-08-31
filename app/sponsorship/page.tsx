import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { formatGHS } from "@/lib/money";

export const dynamic = "force-dynamic";

// What a sponsored business is told about its own funding — including,
// plainly, what happens when the funding stops. A transition plan nobody
// reads is not a transition plan (INS-002, XST-012).

interface Outlook {
  sponsored: boolean;
  funded_product_sets?: string[];
  ends_at?: string | null;
  sponsor_credit_remaining?: number;
  transition_plan?: Record<string, string>;
  your_records?: string;
}

const SET_NAMES: Record<string, string> = {
  pos: "Ascend POS",
  shop: "Ascend Shop",
  services: "Ascend Services",
  documents: "Ascend Documents",
  office: "Ascend Office",
  discover: "Ascend Discover",
  readiness: "Ascend Readiness",
};

const PLAN_LABELS: Record<string, string> = {
  records: "Your records",
  export: "Getting your data out",
  access: "The products you use",
  credit: "Money the sponsor put in",
};

async function load(): Promise<Outlook | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data } = await db.rpc("sponsorship_outlook", {
      p_business: membership.business_id,
    });
    return (data as Outlook) ?? { sponsored: false };
  } catch {
    return null;
  }
}

export default async function Sponsorship() {
  const outlook = await load();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-14">
        <p className="text-sm font-medium text-teal-dark">Your funding</p>

        {outlook === null ? (
          <p className="mt-10 text-ink-muted">
            Verify your WhatsApp number to see your funding.
          </p>
        ) : !outlook.sponsored ? (
          <>
            <h1 className="mt-6 text-3xl font-semibold leading-display text-ink">
              You are paying for your own account.
            </h1>
            <p className="mt-3 max-w-lg text-ink-muted">
              Nobody else is funding this business on Ascend. If a programme or
              bank ever sponsors you, this page will show exactly what they are
              paying for and what happens when they stop.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-semibold leading-display text-ink">
              Someone is funding part of your Ascend account.
            </h1>
            <p className="mt-3 max-w-lg text-ink-muted">
              Here is exactly what they pay for, and what happens when that
              stops. Read the second part now, not later.
            </p>

            <section className="mt-8 border border-line px-5 py-5">
              <h2 className="font-medium text-ink">What they are paying for</h2>
              <ul className="mt-3 space-y-1">
                {(outlook.funded_product_sets ?? []).map((key) => (
                  <li key={key} className="text-sm text-ink">
                    {SET_NAMES[key] ?? key}
                  </li>
                ))}
                {(outlook.funded_product_sets ?? []).length === 0 && (
                  <li className="text-sm text-ink-muted">No products funded.</li>
                )}
              </ul>

              {typeof outlook.sponsor_credit_remaining === "number" &&
                outlook.sponsor_credit_remaining > 0 && (
                  <p className="mt-3 text-sm text-ink-muted">
                    {formatGHS(outlook.sponsor_credit_remaining)} of their credit
                    is left. It can only be spent on what they funded, and
                    anything unspent goes back to them.
                  </p>
                )}

              {outlook.ends_at && (
                <p className="mt-3 text-sm text-gold-dark">
                  Their funding ends{" "}
                  {new Date(outlook.ends_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  .
                </p>
              )}
            </section>

            <section className="mt-6 border border-teal bg-teal-light px-5 py-5">
              <h2 className="font-medium text-teal-dark">
                When the funding stops
              </h2>
              <dl className="mt-3 space-y-3">
                {Object.entries(outlook.transition_plan ?? {}).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm font-medium text-teal-dark">
                      {PLAN_LABELS[key] ?? key}
                    </dt>
                    <dd className="text-sm text-teal-dark">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <p className="mt-6 max-w-lg text-sm text-ink-muted">
              {outlook.your_records}
            </p>
          </>
        )}

        <p className="mt-12 text-sm text-ink-muted">
          Whoever funds your account,{" "}
          <Link href="/sharing" className="tap font-medium text-teal-dark underline">
            you still choose who sees your record
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
