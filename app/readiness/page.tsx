import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";

export const dynamic = "force-dynamic";

// Ascend Readiness. Every number here traces to recorded activity, and the
// page says so. Missing evidence is shown as not yet demonstrated, never as
// poor performance (SCR-008, RDY-010), and no output is presented as a
// promise of finance (SCR-005).

const DIMENSION_COPY: Record<string, { name: string; grows: string }> = {
  identity_stability: {
    name: "Business identity and stability",
    grows: "Grows as your business details and location history stay consistent.",
  },
  financial_activity: {
    name: "Financial activity and integrity",
    grows: "Grows with recorded sales, verified payments and collected invoices.",
  },
  operational_structure: {
    name: "Operational structure",
    grows: "Grows with staff attendance, shifts and consistent daily operations.",
  },
  customer_market: {
    name: "Customer and market activity",
    grows: "Grows with fulfilled orders, completed services and repeat customers.",
  },
  documentation_compliance: {
    name: "Documentation and compliance",
    grows: "Grows as you issue proper quotes, invoices and receipts.",
  },
  governance_control: {
    name: "Governance and control",
    grows: "Grows with reconciled shifts, approvals and separated duties.",
  },
  digital_presence: {
    name: "Digital presence",
    grows: "Grows as customers find and transact with you online.",
  },
  evidence_quality: {
    name: "Evidence quality and freshness",
    grows: "Grows as more of your records come from verified sources.",
  },
};

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  strong: { label: "Well shown", tone: "text-teal-dark" },
  building: { label: "Building up", tone: "text-ink" },
  not_shown_yet: { label: "Not shown yet", tone: "text-ink-muted" },
  concerning: { label: "Needs a look", tone: "text-gold-dark" },
};

interface DimensionRow {
  dimension: string;
  status: string;
  weight: number;
  evidence_weight: number;
  achieved: number;
}

async function load() {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data: results } = await db
      .from("current_readiness")
      .select("kind, value, dimension_breakdown, recommendations, computed_at")
      .eq("business_id", membership.business_id);

    const byKind = new Map((results ?? []).map((r) => [r.kind as string, r]));
    const score = byKind.get("sustainability_score");
    const breakdown = (score?.dimension_breakdown ?? {}) as {
      archetype?: string;
      coverage?: number;
      provisional?: boolean;
      dimensions?: DimensionRow[];
    };

    return {
      hasScore: Boolean(score),
      score: score ? Number(score.value) : 0,
      computedAt: score?.computed_at as string | undefined,
      provisional: Boolean(breakdown.provisional),
      coverage: Number(breakdown.coverage ?? 0),
      dimensions: breakdown.dimensions ?? [],
      confidence: Number(byKind.get("evidence_confidence")?.value ?? 0),
      trust: Number(byKind.get("trust_level")?.value ?? 0),
      fundingReady: Boolean(
        (
          byKind.get("funding_readiness")?.dimension_breakdown as {
            ready_to_present?: boolean;
          } | null
        )?.ready_to_present
      ),
    };
  } catch {
    return null;
  }
}

export default async function Readiness() {
  const data = await load();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-14">
        <p className="text-sm font-medium text-teal-dark">Ascend Readiness</p>
        <h1 className="mt-6 max-w-md text-3xl font-semibold leading-display text-ink">
          What your business record shows
        </h1>
        <p className="mt-3 max-w-lg text-ink-muted">
          Your record is built from how the business actually operates. Every
          sale, receipt, reconciled shift and fulfilled order adds evidence.
          Buying more Ascend products never improves it. Only real activity does.
        </p>

        {data === null ? (
          <p className="mt-10 text-ink-muted">
            Verify your WhatsApp number to see your record.
          </p>
        ) : !data.hasScore || data.dimensions.length === 0 ? (
          <div className="mt-10 border border-line bg-light-grey px-5 py-6">
            <p className="font-medium text-ink">
              Your evidence trail starts with your first sale.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              As you sell, invoice and reconcile, this page fills in. Nothing to
              configure, nothing to self-report.
            </p>
            <Link
              href="/pos"
              className="tap mt-4 inline-flex items-center bg-teal px-4 py-2.5 font-medium text-white"
            >
              Record my first sale
            </Link>
          </div>
        ) : (
          <>
            <section className="mt-10 border border-line px-5 py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm text-ink-muted">Sustainability Score</p>
                  <p className="mt-1 text-4xl font-semibold text-ink">
                    {data.score.toFixed(0)}
                    <span className="text-lg text-ink-muted"> / 100</span>
                  </p>
                </div>
                <div className="text-right text-sm text-ink-muted">
                  <p>Evidence confidence {data.confidence.toFixed(0)}%</p>
                  <p>Trust level {data.trust.toFixed(0)}</p>
                </div>
              </div>

              {data.provisional && (
                <p className="mt-4 bg-gold-light px-3 py-2 text-sm text-gold-ink">
                  This is provisional. Your record does not yet cover enough of
                  how your business runs for the number to mean much. Keep
                  trading and it will settle.
                </p>
              )}

              {data.computedAt && (
                <p className="mt-3 text-xs text-ink-muted">
                  Worked out from your activity, {timeAgo(data.computedAt)}.
                </p>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-medium text-ink-muted">
                What goes into it
              </h2>
              <div className="mt-3 space-y-3">
                {data.dimensions
                  .slice()
                  .sort((a, b) => b.weight - a.weight)
                  .map((dim) => {
                    const copy = DIMENSION_COPY[dim.dimension];
                    const status = STATUS_COPY[dim.status] ?? STATUS_COPY.building;
                    return (
                      <div key={dim.dimension} className="border border-line px-5 py-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium text-ink">
                            {copy?.name ?? dim.dimension}
                          </p>
                          <p className={`text-sm ${status.tone}`}>{status.label}</p>
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">
                          {copy?.grows ?? ""}
                        </p>
                        <div className="mt-3 h-1.5 w-full bg-light-grey">
                          <div
                            className={
                              dim.status === "concerning" ? "h-1.5 bg-gold" : "h-1.5 bg-teal"
                            }
                            style={{
                              width: `${Math.max(Math.round(dim.achieved * 100), dim.status === "not_shown_yet" ? 0 : 3)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          Counts for {dim.weight}% of your score
                        </p>
                      </div>
                    );
                  })}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-sm font-medium text-ink-muted">
                Sharing this with a bank or partner
              </h2>
              <p className="mt-2 max-w-lg text-sm text-ink-muted">
                {data.fundingReady
                  ? "Your record is complete enough to put in front of a partner. You choose who sees it and for how long."
                  : "Your record is not yet complete enough to be worth a partner's time. Keep trading, and keep issuing proper documents."}
              </p>
              <p className="mt-3 max-w-lg text-sm text-ink-muted">
                Ascend evidence is one input into a partner&apos;s own decision.
                It is not an offer, an approval, or a guarantee of finance.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return "just now";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
