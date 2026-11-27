import Link from "next/link";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { Card, Pill } from "@/components/billing/Parts";
import { DismissSuggestion } from "@/components/billing/BillingActions";
import { MODULES, billingTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { ascendWhatsApp, ghs, loadBilling, loadBillingSuggestions, type Offer } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// Add to your business (round 3, P4), from the design: suggestions from
// the business's own numbers, then everything Ascend offers at the
// design's prices (decision 7). Only what Ascend can deliver today can be
// asked for here; devices and bundles are arranged with Ascend, and what
// is not built yet says Coming.

const FILTERS: Array<[string, string]> = [
  ["all", "All"],
  ["run", "Passes"],
  ["packs", "Packs"],
  ["devices", "Devices"],
  ["grow", "Grow and protect"],
];
const HEAD: Record<string, string> = { run: "Run", packs: "Packs", devices: "Devices", grow: "Grow and protect" };

function term(o: Offer): string {
  if (o.kind === "hardware") return "one-time, device";
  if (o.days === 365) return "for 12 months";
  if (o.days === 182) return "for 6 months";
  if (o.days === 30) return "for one month";
  return "one-time";
}

export default async function AddPage({ searchParams }: { searchParams: { show?: string } }) {
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
  const suggestions = await loadBillingSuggestions(workspace.businessId, d).catch(() => []);
  const show = FILTERS.some(([k]) => k === searchParams.show) ? (searchParams.show as string) : "all";
  const shown = d.offers.filter((o) => ["run", "packs", "devices", "grow"].includes(o.section) && (show === "all" || o.section === show));
  const sections = Array.from(new Set(shown.map((o) => o.section)));
  const ask = ascendWhatsApp(d.manager, `Hello, this is ${d.businessName}. I would like to ask about something on Ascend.`);
  const askLabel = d.manager ? `Ask ${d.manager.name}` : "Ask Ascend";

  return (
    <ModulePage identity={MODULES.billing} tabs={billingTabs("/billing/add")}>
      <div className="flex flex-col gap-5">
        {suggestions.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-heading text-[18px] font-bold text-ink-heading">Suggested from your numbers</h2>
              <p className="text-[13px] text-neutral-600">Each one is based on what is happening in your business now. Hide any you do not want.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {suggestions.map((s) => (
                <Card key={s.key} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-eyebrow text-teal-700">{s.kicker}</span>
                    <DismissSuggestion suggestionKey={s.key} businessId={workspace.businessId} />
                  </div>
                  <strong className="font-heading text-[16px] text-ink-heading">{s.title}</strong>
                  <p className="text-[13.5px] font-semibold text-ink">{s.why}</p>
                  <p className="text-[13px] leading-relaxed text-neutral-600">{s.what}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                    <span className="flex flex-col">
                      <span className="num font-heading text-[18px] font-extrabold text-ink-heading">{s.price}</span>
                      <span className="text-[12px] text-neutral-500">{s.priceNote}</span>
                    </span>
                    {s.href === "ask" ? (
                      ask ? (
                        <a href={ask} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[40px]`}>{s.action}</a>
                      ) : (
                        <span className="text-[12.5px] text-neutral-500">Ascend will reach you on WhatsApp.</span>
                      )
                    ) : (
                      <Link href={s.href} className={`${primaryAction} min-h-[40px]`}>{s.action}</Link>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-[18px] font-bold text-ink-heading">Everything Ascend offers</h2>
            <Link href="/billing/bundles" className="tap flex min-h-[44px] items-center text-[13.5px] font-bold text-teal-700 hover:text-teal-800">Compare bundles</Link>
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show">
            {FILTERS.map(([k, l]) => (
              <Link
                key={k}
                href={k === "all" ? "/billing/add" : `/billing/add?show=${k}`}
                aria-current={show === k ? "page" : undefined}
                className={`tap inline-flex min-h-[40px] flex-none items-center rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${show === k ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"}`}
              >
                {l}
              </Link>
            ))}
          </div>

          {!d.ready ? (
            <EmptyState title="Prices switch on after this week's update." detail="Everything you use now stays as it is." />
          ) : (
            sections.map((sec) => (
              <Card key={sec} className="!px-0 !py-0">
                <h3 className="px-[18px] pb-2 pt-4 text-[11px] font-bold uppercase tracking-eyebrow text-neutral-500 sm:px-5">{HEAD[sec]}</h3>
                {shown
                  .filter((o) => o.section === sec)
                  .map((o) => (
                    <div key={o.sku} className="flex flex-col gap-2 border-t border-neutral-100 px-[18px] py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] font-bold text-ink">{o.name}</span>
                        <span className="text-[12.5px] text-neutral-600">{o.blurb}</span>
                      </span>
                      <span className="flex flex-none items-center justify-between gap-3 sm:justify-end">
                        <span className="flex flex-col sm:items-end">
                          <span className="num text-[14px] font-bold text-ink">{ghs(o.amount)}</span>
                          <span className="text-[11.5px] text-neutral-500">{term(o)}</span>
                        </span>
                        {o.active ? (
                          <Pill tone="ok">Active</Pill>
                        ) : o.mode === "buy" ? (
                          <Link href={`/billing/get/${o.sku}`} className={`${secondaryAction} min-h-[40px]`}>Add</Link>
                        ) : o.mode === "ask" ? (
                          ask ? (
                            <a href={ask} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[40px]`}>{askLabel}</a>
                          ) : (
                            <Pill tone="info">Through Ascend</Pill>
                          )
                        ) : (
                          <Pill tone="mute">Coming</Pill>
                        )}
                      </span>
                    </div>
                  ))}
              </Card>
            ))
          )}
          {d.ready && (
            <div className="flex flex-col gap-1 rounded-[16px] bg-neutral-50 px-4 py-3 text-[13px] leading-relaxed text-neutral-700">
              <span>
                Prefer someone to set it up? Done-for-you setup with an Ascend field agent is {ghs(d.offers.find((o) => o.sku === "setup_starter")?.amount ?? 500)} per location, or free when your programme sponsors it.
              </span>
              <span>Promoting on Discover is paid from your Ascend Balance. <Link href="/billing/get/top-up" className="font-semibold text-teal-700 underline-offset-2 hover:underline">Top up your Balance</Link>.</span>
            </div>
          )}
        </section>
      </div>
    </ModulePage>
  );
}
