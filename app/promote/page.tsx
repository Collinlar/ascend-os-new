import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { StatusPill, type Tone } from "@/components/shell/Parts";
import PromoteManager, { type CampaignRow, type ListingRow } from "@/components/discover/PromoteManager";
import CampaignToggle from "@/components/discover/CampaignToggle";
import { MODULES, promotionsTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { formatGHS } from "@/lib/money";
import { campaignType, loadBalance, loadPromotionFigures, type CampaignFigures } from "@/lib/promote/load";

export const dynamic = "force-dynamic";

// Promote with Ascend (round 3, P1), from the design's Promotions overview:
// what promotion reached and brought in over 30 days, from seen to sold,
// every campaign with its results, and the Ascend Balance with its own
// money and sponsored credit apart. Orders and bookings count when they
// follow a click on Discover within 7 days (0146).

const ACCRA = "Africa/Accra";
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short" });
const count = (n: number) => n.toLocaleString("en-GH");

function status(c: CampaignFigures): { text: string; tone: Tone } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });
  // Review first (round 3, P2): nothing runs or is charged before it passes.
  if (c.reviewStatus === "pending") return { text: "In review", tone: "warn" };
  if (c.reviewStatus === "declined") return { text: "Not approved", tone: "bad" };
  if (c.listingStatus === "suspended") return { text: "Removed from Discover", tone: "bad" };
  if (c.listingStatus === "pending_review") return { text: "In review", tone: "warn" };
  if (c.status === "paused") return { text: "Paused by you", tone: "mute" };
  if (c.status === "exhausted") return { text: "Budget used up", tone: "mute" };
  if (c.status === "ended" || (c.endsAt && c.endsAt < today)) return { text: c.endsAt ? `Ended ${day(c.endsAt)}` : "Ended", tone: "mute" };
  if (c.status === "draft") return { text: "Not started", tone: "mute" };
  if (c.endsAt) {
    const left = Math.max(0, Math.round((new Date(`${c.endsAt}T23:59:59Z`).getTime() - Date.now()) / 864e5));
    return { text: `Live · ${left} day${left === 1 ? "" : "s"} left`, tone: "ok" };
  }
  return { text: "Live", tone: "ok" };
}

export default async function Promote() {
  await checkPageAccess("/promote");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.promotions}>
        <EmptyState title="Sign in to manage this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const db = supabaseServer();
  const [figures, balance, listings, performance] = await Promise.all([
    loadPromotionFigures(workspace.businessId),
    loadBalance(workspace.businessId),
    db.from("discover_listing").select("id, status, category, city, suspended_reason, item:item_id(name)").eq("business_id", workspace.businessId),
    db.rpc("campaign_performance", { p_business: workspace.businessId }),
  ]);
  const t = figures?.totals ?? { seen: 0, clicks: 0, visits: 0, orders: 0, bookings: 0, sales: 0, spent: 0 };
  const campaigns = figures?.campaigns ?? [];
  const sold = t.orders + t.bookings;
  // Only once orders can be traced back to a click (0146).
  const perCedi = figures?.traced && t.spent > 0 ? t.sales / t.spent : null;
  const funnel = [
    { label: "Seen on Discover", n: t.seen },
    { label: "Clicked", n: t.clicks },
    { label: "Visited your Shop", n: t.visits },
    { label: "Ordered or booked", n: sold },
  ];
  const top = Math.max(1, funnel[0].n);

  return (
    <ModulePage identity={MODULES.promotions} tabs={promotionsTabs("/promote")}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label="Seen, last 30 days" value={count(t.seen)} sub="People looking on Discover" />
          <Figure label="Clicks" value={count(t.clicks)} sub={t.seen > 0 ? `${((t.clicks / t.seen) * 100).toFixed(1)}% of people who saw it` : "Nobody has seen a promotion yet"} />
          <Figure label="Orders and bookings" value={count(sold)} sub="Within 7 days of a click" />
          <Figure
            label="Earned per GHS 1 spent"
            value={perCedi === null ? "Not yet" : formatGHS(Math.round(perCedi * 100) / 100)}
            sub={perCedi === null ? (t.spent > 0 ? "Counted from the next order a click brings" : "Once a promotion has spent something") : `${formatGHS(t.sales)} from ${formatGHS(t.spent)}`}
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-heading text-base font-bold text-ink-heading">From seen to sold</h2>
                <span className="text-xs text-neutral-600">All campaigns · last 30 days</span>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {funnel.map((f) => (
                  <div key={f.label} className="grid grid-cols-[150px_minmax(0,1fr)_64px] items-center gap-3 text-[13px] max-sm:grid-cols-[110px_minmax(0,1fr)_52px]">
                    <span className="text-neutral-700">{f.label}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-neutral-100">
                      <span className="block h-full rounded-full bg-teal-brand" style={{ width: `${Math.max(f.n > 0 ? 2 : 0, (f.n / top) * 100)}%` }} />
                    </span>
                    <span className="num text-right font-semibold text-ink">{count(f.n)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-[20px] border border-line-brand bg-white">
              <div className="flex items-center justify-between gap-2 px-[18px] pb-2 pt-4">
                <h2 className="font-heading text-base font-bold text-ink-heading">Campaigns</h2>
                <Link href="/promote/new" className={`${secondaryAction} min-h-[40px]`}>
                  New campaign
                </Link>
              </div>
              {campaigns.length === 0 ? (
                <p className="px-[18px] pb-4 text-[13.5px] text-neutral-600">No campaigns yet. Start one, or choose a listing below to promote it.</p>
              ) : (
                <>
                  <div aria-hidden className={`hidden bg-neutral-50 px-[18px] py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${COLS}`}>
                    <span>Campaign</span>
                    <span>Where</span>
                    <span className="text-right">Spent</span>
                    <span>Results</span>
                    <span>Status</span>
                  </div>
                  {campaigns.map((c) => {
                    const st = status(c);
                    return (
                      <div key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-neutral-100 px-[18px] py-3 text-[13.5px] ${COLS}`}>
                        <Link href={`/promote/${c.id}`} className="tap flex min-w-0 basis-full flex-col lg:basis-auto">
                          <span className="truncate font-semibold text-ink underline-offset-2 hover:underline">{c.itemName ?? workspace.businessName}</span>
                          <span className="text-xs text-neutral-600">{campaignType(c)}</span>
                          {c.reviewStatus === "declined" && c.reviewNote && (
                            <span className="text-xs text-danger-ink">Ascend: {c.reviewNote}</span>
                          )}
                        </Link>
                        <span className="text-neutral-700">{c.city ?? "Discover"}</span>
                        <span className="num text-neutral-700 lg:text-right">
                          {formatGHS(c.spent)} <span className="text-neutral-500">of {formatGHS(c.budget)}</span>
                          {c.dailyBudget !== null && <span className="block text-xs text-neutral-500">{formatGHS(c.dailyBudget)} a day</span>}
                        </span>
                        <span className="text-neutral-700">
                          {count(c.clicks)} click{c.clicks === 1 ? "" : "s"} · {count(c.orders + c.bookings)} {c.itemKind === "service" ? "booking" : "order"}
                          {c.orders + c.bookings === 1 ? "" : "s"}
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusPill tone={st.tone}>{st.text}</StatusPill>
                          {(c.status === "paused" || (c.status === "running" && c.listingStatus === "eligible")) && (
                            <CampaignToggle campaignId={c.id} paused={c.status === "paused"} />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </section>

            <PromoteManager
              compact
              balance={balance.total}
              listings={((listings.data ?? []) as Array<Record<string, unknown>>).map(
                (l): ListingRow => ({
                  id: l.id as string,
                  status: l.status as string,
                  name: (l.item as { name: string } | null)?.name ?? "Your business",
                  city: (l.city as string) ?? null,
                  suspendedReason: (l.suspended_reason as string) ?? null,
                })
              )}
              campaigns={(performance.data ?? []) as CampaignRow[]}
            />
          </div>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-heading text-base font-bold text-ink-heading">Ascend Balance</h2>
                <span className="text-xs text-neutral-600">Pays for promotion only</span>
              </div>
              <p className="num font-heading text-[28px] font-extrabold text-ink-heading">{formatGHS(balance.total)}</p>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <span className="flex justify-between">
                  <span className="text-neutral-600">Your money</span>
                  <span className="num font-semibold text-ink">{formatGHS(balance.own)}</span>
                </span>
                {balance.sponsored > 0 && (
                  <span className="flex justify-between">
                    <span className="text-neutral-600">Sponsored{balance.sponsor?.until ? `, until ${day(balance.sponsor.until)}` : ""}</span>
                    <span className="num font-semibold text-ink">{formatGHS(balance.sponsored)}</span>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Link href="/promote/balance" className={`${secondaryAction} min-h-[40px] flex-1 justify-center`}>
                  Top up and history
                </Link>
              </div>
            </section>

            <p className="rounded-[16px] bg-neutral-50 px-4 py-3 text-[12.5px] leading-relaxed text-neutral-600">
              Promoted listings always show a <strong className="text-ink">Sponsored</strong> label. Verified, Trusted and Ascend Pick cannot be bought, and paying does not change your normal ranking.
            </p>
          </div>
        </div>
      </div>
    </ModulePage>
  );
}

// The design's campaign table from 1024px: campaign, where, spent, results, status.
const COLS = "lg:grid lg:grid-cols-[minmax(0,1.4fr)_110px_150px_minmax(0,1fr)_210px] lg:items-center lg:gap-3";

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
      <span className="text-[12.5px] text-neutral-600">{label}</span>
      <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{value}</span>
      <span className="text-xs text-neutral-600">{sub}</span>
    </div>
  );
}
