import Link from "next/link";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { Card, Pill } from "@/components/billing/Parts";
import { MODULES, billingTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { ascendWhatsApp, ghs, loadBilling } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// Compare bundles (round 3, P4), from the design: Start, Grow and Run for
// 12 months, with credit for what is already paid. Bundles carry CRM
// automation and message packs, which are not built yet, so a bundle is
// arranged with Ascend rather than bought here.

const ROWS: Array<[string, string, string, string]> = [
  ["Mobile POS, Shop, Services basics", "yes", "yes", "yes"],
  ["Quotes, invoices, receipts", "yes", "yes", "yes"],
  ["CRM records and history", "yes", "yes", "yes"],
  ["Documents Plus: logo, colour, numbering", "", "yes", "yes"],
  ["CRM automation and segments (coming)", "", "yes", "yes"],
  ["WhatsApp sends included (coming)", "", "1,000", "3,000"],
  ["Discover credit included", "", "GHS 300", "GHS 600"],
  ["Office: team, approvals, leave", "", "", "yes"],
  ["Multi-location inventory", "", "", "yes"],
  ["Done-for-you setup visit", "", "", "1 per location"],
  ["Account Manager", "In app", "WhatsApp", "Named, monthly review"],
];

function Cell({ v }: { v: string }) {
  if (v === "yes") return <span className="font-bold text-teal-700" aria-label="Included">Yes</span>;
  if (!v) return <span className="text-neutral-500" aria-label="Not included">No</span>;
  return <span className="text-ink">{v}</span>;
}

export default async function BundlesPage({ searchParams }: { searchParams: { counted?: string } }) {
  await checkPageAccess("/billing");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.billing}>
        <EmptyState title="Sign in to see this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const d = await loadBilling(workspace.businessId);
  const counted = searchParams.counted === "1";
  const price = (sku: string, fallback: number) => d.offers.find((o) => o.sku === sku)?.amount ?? fallback;
  // What the business already paid for and still has, at today's price.
  const paidFor = (key: string) => d.paid.some((p) => p.key === key && p.kind === "Paid");
  const credit = (keys: Array<[string, string]>) => keys.filter(([k]) => paidFor(k)).reduce((n, [, sku]) => n + price(sku, 0), 0);
  const growCredit = credit([["documents_plus", "documents_plus_12m"]]);
  const runCredit = credit([["documents_plus", "documents_plus_12m"], ["office", "team_ops_15"], ["advanced_inventory", "advanced_inventory_12m"]]);
  const fits = d.counts.places >= 2 || d.counts.people >= 6 ? "run" : d.counts.customers >= 100 ? "grow" : "start";

  const bundles = [
    { key: "start", name: "Start", line: "Sell, take payments and keep your records", price: "Free", per: "always", note: "You are using it now", credit: 0 },
    { key: "grow", name: "Grow", line: "Bring customers back and get paid faster", price: ghs(price("bundle_grow_12m", 1800)), per: "for 12 months", note: "", credit: growCredit, amount: price("bundle_grow_12m", 1800) },
    { key: "run", name: "Run", line: "Run several locations and a team", price: ghs(price("bundle_run_12m", 3600)), per: "for 12 months", note: "", credit: runCredit, amount: price("bundle_run_12m", 3600) },
  ];
  const ask = (n: string) => ascendWhatsApp(d.manager, `Hello, this is ${d.businessName}. I would like to ask about the ${n} bundle.`);

  return (
    <ModulePage identity={MODULES.billing} tabs={billingTabs("/billing/bundles")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-[18px] font-bold text-ink-heading">Bundles save money when you need several things</h2>
            <p className="text-[13.5px] text-neutral-600">Pay once for 12 months. Nothing renews by itself, and you keep all your data and documents if you stop.</p>
          </div>
          <Link
            href={counted ? "/billing/bundles" : "/billing/bundles?counted=1"}
            aria-pressed={counted}
            className={`tap inline-flex min-h-[44px] flex-none items-center gap-2 rounded-full border-[1.5px] px-4 text-[13px] font-semibold ${counted ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"}`}
          >
            <span aria-hidden className={`flex h-4 w-7 items-center rounded-full p-0.5 ${counted ? "justify-end bg-teal-700" : "justify-start bg-neutral-300"}`}>
              <span className="h-3 w-3 rounded-full bg-white" />
            </span>
            Count what I already paid for
          </Link>
        </div>

        <p className="text-[13.5px] text-ink">
          {d.counts.places} location{d.counts.places === 1 ? "" : "s"}, {d.counts.people} {d.counts.people === 1 ? "person" : "people"}, {d.counts.customers.toLocaleString("en-GB")} customers.{" "}
          <strong>{fits === "start" ? "Start" : fits === "grow" ? "Grow" : "Run"} fits how you work today.</strong>
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {bundles.map((b) => {
            const rec = b.key === fits;
            const after = counted && b.credit > 0 && b.amount ? `${ghs(b.amount - b.credit)} after what you already paid for` : "";
            const link = ask(b.name);
            return (
              <Card key={b.key} className={`flex flex-col gap-2 ${rec ? "border-teal-700 bg-teal-50/40" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-heading text-[18px] text-ink-heading">{b.name}</strong>
                  {rec && <Pill tone="teal">Fits you</Pill>}
                </div>
                <p className="text-[13px] text-neutral-600">{b.line}</p>
                <p>
                  <span className="num font-heading text-[24px] font-extrabold text-ink-heading">{b.price}</span>{" "}
                  <span className="text-[12.5px] text-neutral-500">{b.per}</span>
                </p>
                {(after || b.key === "start") && <p className="text-[12.5px] font-semibold text-success-ink">{after || b.note}</p>}
                {b.key === "start" ? (
                  <span className={`${secondaryAction} mt-auto min-h-[40px] justify-center opacity-70`}>Current</span>
                ) : link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className={`${rec ? primaryAction : secondaryAction} mt-auto min-h-[40px] justify-center`}>
                    Ask about {b.name}
                  </a>
                ) : (
                  <p className="mt-auto text-[12.5px] text-neutral-500">Ask Ascend about {b.name} on WhatsApp.</p>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="!px-0 !py-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] font-semibold text-neutral-500">
                  <th className="px-5 py-3 font-semibold">What is included</th>
                  <th className="px-3 py-3 font-semibold">Start</th>
                  <th className="px-3 py-3 font-semibold">Grow</th>
                  <th className="px-3 py-3 font-semibold">Run</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([what, s, g, r]) => (
                  <tr key={what} className="border-t border-neutral-100">
                    <td className="px-5 py-2.5 text-ink">{what}</td>
                    <td className="px-3 py-2.5"><Cell v={s} /></td>
                    <td className="px-3 py-2.5"><Cell v={g} /></td>
                    <td className="px-3 py-2.5"><Cell v={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-1 rounded-[16px] bg-neutral-50 px-4 py-3 text-[13px] leading-relaxed text-neutral-700">
          <span>Pay by bank transfer or MoMo to Ascend. MoMo and card in the app are coming. Ascend charges never come out of your sales.</span>
          <span>Programmes and partners can sponsor all or part of a bundle. Ask Ascend if yours does.</span>
          <span>More than 5 locations or a group of businesses? We build a package with you.</span>
        </div>
      </div>
    </ModulePage>
  );
}
