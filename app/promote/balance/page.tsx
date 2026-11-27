import Link from "next/link";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import { MODULES, promotionsTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { formatGHS } from "@/lib/money";
import { loadBalance } from "@/lib/promote/load";

export const dynamic = "force-dynamic";

// Ascend Balance (round 3, P1), from the design's Balance screen: the
// business's own money and sponsored credit apart, what the credit is for
// and when it ends, and every movement. Topping up by MoMo waits for
// Paystack (decision 6); until then Ascend records a bank transfer.

const ACCRA = "Africa/Accra";
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short", year: "numeric" });
const FILTERS: Array<[string, string]> = [
  ["all", "All"],
  ["topups", "Top-ups and credit"],
  ["spend", "Spending"],
];

export default async function BalancePage({ searchParams }: { searchParams: { show?: string } }) {
  await checkPageAccess("/promote");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.promotions}>
        <EmptyState title="Sign in to see this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const b = await loadBalance(workspace.businessId);
  const show = FILTERS.some(([k]) => k === searchParams.show) ? (searchParams.show as string) : "all";
  const rows = b.entries.filter((e) => (show === "all" ? true : show === "spend" ? e.amount < 0 : e.amount > 0)).slice(0, 100);

  return (
    <ModulePage identity={MODULES.promotions} tabs={promotionsTabs("/promote/balance")}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure label="Ascend Balance" value={formatGHS(b.total)} sub="Pays for promotion only" />
            <Figure label="Your money" value={formatGHS(b.own)} sub="What you topped up" />
            <Figure label="Sponsored" value={formatGHS(b.sponsored)} sub={b.sponsor?.until ? `Until ${day(b.sponsor.until)}` : b.sponsored > 0 ? "No end date" : "None right now"} />
          </div>

          <section className="overflow-hidden rounded-[20px] border border-line-brand bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pb-2 pt-4">
              <h2 className="font-heading text-base font-bold text-ink-heading">Balance history</h2>
              <div className="flex gap-1.5" role="group" aria-label="Show">
                {FILTERS.map(([k, l]) => (
                  <Link
                    key={k}
                    href={k === "all" ? "/promote/balance" : `/promote/balance?show=${k}`}
                    aria-current={show === k ? "page" : undefined}
                    className={`tap inline-flex min-h-[36px] items-center rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${
                      show === k ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"
                    }`}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="px-[18px] pb-4 text-[13.5px] text-neutral-600">Nothing here yet.</p>
            ) : (
              <>
                <div aria-hidden className="hidden grid-cols-[120px_minmax(0,1fr)_110px_110px] gap-3 bg-neutral-50 px-[18px] py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 sm:grid">
                  <span>Date</span>
                  <span>What</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Balance</span>
                </div>
                {rows.map((e) => (
                  <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-neutral-100 px-[18px] py-2.5 text-[13.5px] sm:grid-cols-[120px_minmax(0,1fr)_110px_110px]">
                    <span className="text-neutral-600 max-sm:order-2 max-sm:text-xs">{day(e.at)}</span>
                    <span className="text-ink max-sm:order-1">{e.what}</span>
                    <span className={`num text-right font-semibold max-sm:order-3 ${e.amount < 0 ? "text-ink" : "text-success-ink"}`}>
                      {e.amount < 0 ? `-${formatGHS(-e.amount)}` : `+${formatGHS(e.amount)}`}
                    </span>
                    <span className="num text-right text-neutral-600 max-sm:hidden">{formatGHS(e.after)}</span>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
            <h2 className="font-heading text-base font-bold text-ink-heading">Top up</h2>
            <p className="text-[13px] leading-relaxed text-neutral-700">
              Topping up by MoMo or card in the app is coming. To add money now, talk to Ascend and pay by bank transfer; it is added to your Balance once the transfer arrives.
            </p>
            <p className="text-xs text-neutral-600">Your sales settlements are never touched. GHS 1 in your Balance is worth GHS 1 of promotion.</p>
          </section>

          {b.sponsor && (
            <section className="flex flex-col gap-2 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-base font-bold text-ink-heading">Sponsored credit</h2>
                <span className="rounded-full bg-success-tint px-2.5 py-0.5 text-[12px] font-bold text-success-ink">Active</span>
              </div>
              <Row k="From" v={b.sponsor.name} />
              <Row k="For" v="Discover promotion only" />
              <Row k="Given" v={`${formatGHS(b.sponsor.given)} on ${day(b.sponsor.givenAt)}`} />
              <Row k="Left" v={`${formatGHS(b.sponsored)}${b.sponsor.until ? `, until ${day(b.sponsor.until)}` : ""}`} />
              <p className="text-xs leading-relaxed text-neutral-600">
                Sponsored credit is used before your own money.{b.sponsor.until ? ` It ends on ${day(b.sponsor.until)} and` : " It"} cannot be cashed out.
              </p>
            </section>
          )}
        </div>
      </div>
    </ModulePage>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
      <span className="text-[12.5px] text-neutral-600">{label}</span>
      <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{value}</span>
      <span className="text-xs text-neutral-600">{sub}</span>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between gap-3 text-[13px]">
      <span className="text-neutral-600">{k}</span>
      <span className="text-right font-semibold text-ink">{v}</span>
    </span>
  );
}
