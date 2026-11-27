import Link from "next/link";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { Card, KIND_TONE, Pill, day } from "@/components/billing/Parts";
import { MODULES, billingTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { ascendWhatsApp, ghs, loadBilling } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// What you have (round 3, P4), from the design: everything free, paid and
// sponsored with why and until when, what is coming up first, the Account
// Manager (decision 8), and what is not on yet.

export default async function BillingPage() {
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
  const sponsoredCount = d.paid.filter((p) => p.kind === "Sponsored").length + (d.balance.sponsored > 0 ? 1 : 0);
  const paidCount = d.paid.filter((p) => p.kind === "Paid").length;
  const waiting = d.orders.filter((o) => o.status === "waiting");

  const coming: Array<{ title: string; detail: string; href?: string; action?: string }> = [];
  for (const o of waiting) {
    coming.push({
      title: `Waiting for your payment: ${o.kind === "top_up" ? `${ghs(o.amount)} top-up` : o.description}`,
      detail: `Pay ${ghs(o.amount)} quoting ${o.reference}. It switches on when Ascend records it.`,
      href: o.kind === "top_up" ? "/billing/get/top-up" : `/billing/get/${o.sku}`,
      action: "See how to pay",
    });
  }
  for (const p of d.paid.filter((x) => x.endingSoon && x.until)) {
    const sku = d.offers.find((o) => o.productSet === p.key && o.mode === "buy")?.sku;
    coming.push({ title: `${p.name} ends ${day(p.until as string)}`, detail: "Nothing renews by itself. Your records stay if it ends.", href: sku ? `/billing/get/${sku}` : undefined, action: sku ? "Keep it another year" : undefined });
  }
  if (d.balance.sponsored > 0 && d.balance.sponsor?.until && new Date(d.balance.sponsor.until).getTime() - Date.now() < 30 * 864e5) {
    coming.push({ title: `Discover credit ends ${day(d.balance.sponsor.until)}`, detail: `${ghs(d.balance.sponsored)} sponsored credit left. It is used before your own money.`, href: "/promote/new", action: "Start a campaign" });
  }

  const notActive = d.offers.filter((o) => o.section === "run" && !o.active && !(o.productSet === "office" && d.offers.some((x) => x.productSet === "office" && x.active)));
  const seen = new Set<string>();
  const notActiveOne = notActive.filter((o) => {
    const k = o.productSet ?? o.name.split(",")[0];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const talk = ascendWhatsApp(d.manager, `Hello, this is ${d.businessName}. I would like help with what to add on Ascend.`);

  return (
    <ModulePage identity={MODULES.billing} tabs={billingTabs("/billing")}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-[560px] text-[14px] leading-relaxed text-neutral-700">
              <strong className="text-ink">
                {d.free.length} free, {paidCount} paid, {sponsoredCount} sponsored.
              </strong>{" "}
              No monthly subscription: you only pay for what you add, and you keep everything you created.
            </p>
            <div className="flex flex-col sm:items-end">
              <span className="text-[12px] text-neutral-500">Paid to Ascend this year</span>
              <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{ghs(d.paidThisYear)}</span>
            </div>
          </div>

          <Card className="!px-0 !py-0">
            <h2 className="px-[18px] pb-2 pt-4 font-heading text-base font-bold text-ink-heading sm:px-5">Free, always</h2>
            {d.free.map((f) => (
              <div key={f.key} className="flex items-start gap-3 border-t border-neutral-100 px-[18px] py-3 sm:px-5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-bold text-ink">{f.name}</span>
                  <span className="text-[13px] leading-snug text-neutral-600">{f.detail}</span>
                </span>
                <Pill tone="teal">Free</Pill>
              </div>
            ))}
          </Card>

          <Card className="!px-0 !py-0">
            <h2 className="px-[18px] pb-2 pt-4 font-heading text-base font-bold text-ink-heading sm:px-5">Paid and sponsored</h2>
            {d.paid.length === 0 && d.balance.sponsored <= 0 ? (
              <p className="border-t border-neutral-100 px-[18px] py-4 text-[13.5px] text-neutral-600 sm:px-5">Nothing paid or sponsored yet. Everything above stays free.</p>
            ) : (
              <>
                {d.paid.map((p) => (
                  <div key={p.key} className="flex items-start gap-3 border-t border-neutral-100 px-[18px] py-3 sm:px-5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-bold text-ink">{p.name}</span>
                      <span className={`text-[12.5px] font-semibold ${p.endingSoon ? "text-gold-ink" : "text-success-ink"}`}>{p.until ? `Active until ${day(p.until)}` : "Active, no end date"}</span>
                      <span className="text-[13px] leading-snug text-neutral-600">{p.detail}</span>
                    </span>
                    <Pill tone={KIND_TONE[p.kind] ?? "mute"}>{p.kind}</Pill>
                  </div>
                ))}
                {d.balance.sponsored > 0 && (
                  <div className="flex items-start gap-3 border-t border-neutral-100 px-[18px] py-3 sm:px-5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-bold text-ink">Discover credit</span>
                      <span className="text-[12.5px] font-semibold text-success-ink">{ghs(d.balance.sponsored)} left</span>
                      <span className="text-[13px] leading-snug text-neutral-600">
                        {d.balance.sponsor ? `From ${d.balance.sponsor.name}. ` : ""}Promotion only{d.balance.sponsor?.until ? `, until ${day(d.balance.sponsor.until)}` : ""}.
                      </span>
                    </span>
                    <Pill tone="warn">Sponsored</Pill>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className="font-heading text-base font-bold text-ink-heading">Coming up</h2>
            {coming.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-neutral-600">Nothing ends in the next 30 days.</p>
            ) : (
              <div className="mt-2 flex flex-col">
                {coming.map((c) => (
                  <div key={c.title} className="flex flex-col gap-1 border-t border-neutral-100 py-3 first:border-t-0 first:pt-1">
                    <strong className="text-[13.5px] text-ink">{c.title}</strong>
                    <span className="text-[13px] leading-snug text-neutral-600">{c.detail}</span>
                    {c.href && c.action && (
                      <Link href={c.href} className={`${secondaryAction} mt-1 min-h-[40px] self-start`}>
                        {c.action}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            {d.manager ? (
              <>
                <strong className="text-[14px] text-ink">{d.manager.name}</strong>
                <p className="text-[12.5px] text-neutral-500">Your Account Manager</p>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-700">Not sure what you need next? {d.manager.name} can look at your numbers with you and set things up, at no cost.</p>
              </>
            ) : (
              <>
                <strong className="text-[14px] text-ink">Talk to Ascend</strong>
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-700">Not sure what you need next? Ascend can look at your numbers with you and set things up, at no cost.</p>
              </>
            )}
            {talk ? (
              <a href={talk} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} mt-3 min-h-[40px]`}>
                {d.manager ? `WhatsApp ${d.manager.name}` : "WhatsApp Ascend"}
              </a>
            ) : (
              <p className="mt-2 text-[12.5px] text-neutral-500">Ascend reaches you on the WhatsApp number your business is set up with.</p>
            )}
          </Card>

          {notActiveOne.length > 0 && (
            <Card className="!px-0 !py-0">
              <h2 className="px-[18px] pb-2 pt-4 font-heading text-base font-bold text-ink-heading sm:px-5">Not active</h2>
              {notActiveOne.map((o) => (
                <div key={o.sku} className="flex items-center gap-3 border-t border-neutral-100 px-[18px] py-3 sm:px-5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13.5px] font-semibold text-ink">{o.name.replace(/, .*$/, "")}</span>
                    <span className="text-[12.5px] text-neutral-500">{o.blurb}</span>
                  </span>
                  {o.mode === "buy" ? (
                    <Link href={`/billing/get/${o.sku}`} className="tap flex min-h-[44px] flex-none items-center text-[13px] font-bold text-teal-700 hover:text-teal-800">
                      See offer
                    </Link>
                  ) : (
                    <Pill tone="mute">Coming</Pill>
                  )}
                </div>
              ))}
            </Card>
          )}

          {!d.ready && <p className="text-[12.5px] text-neutral-500">Prices and buying switch on after this week&apos;s update.</p>}
        </div>
      </div>
    </ModulePage>
  );
}
