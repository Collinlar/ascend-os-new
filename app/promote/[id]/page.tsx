import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { StatusPill } from "@/components/shell/Parts";
import CampaignToggle from "@/components/discover/CampaignToggle";
import { MODULES } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { formatGHS } from "@/lib/money";
import { campaignType, loadPromotionFigures } from "@/lib/promote/load";

export const dynamic = "force-dynamic";

// One campaign's results (round 3, P1), from the design's Campaign results:
// reach and what it brought in, by day, where the orders came from, and
// what it cost. Attributed sales count orders and bookings within 7 days
// of a click on Discover (0146).

const ACCRA = "Africa/Accra";
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short" });
const count = (n: number) => n.toLocaleString("en-GH");

export default async function CampaignResults({ params }: { params: { id: string } }) {
  await checkPageAccess("/promote");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.promotions}>
        <EmptyState title="Sign in to see this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const db = supabaseServer();
  const [figures, daysRes, ordersRes] = await Promise.all([
    loadPromotionFigures(workspace.businessId, 365),
    db.rpc("promotion_days", { p_business: workspace.businessId, p_campaign: params.id }),
    db
      .from("discover_event")
      .select("interaction")
      .eq("campaign_id", params.id)
      .in("interaction", ["ordered", "booked"])
      .eq("was_promoted", true)
      .limit(1000),
  ]);
  const c = figures?.campaigns.find((x) => x.id === params.id);
  if (!c) notFound();

  const days = ((daysRes.data ?? []) as Array<{ day: string; seen: number; clicks: number; orders: number; bookings: number; sales: number }>).slice(-30);
  const peak = Math.max(1, ...days.map((d) => d.clicks));
  const sold = c.orders + c.bookings;
  const perCedi = figures?.traced && c.spent > 0 ? c.sales / c.spent : null;
  const where = new Map<string, number>();
  for (const e of (ordersRes.data ?? []) as Array<Record<string, unknown>>) {
    const label = e.interaction === "booked" ? "Bookings on your booking page" : "Your Shop online";
    where.set(label, (where.get(label) ?? 0) + 1);
  }
  const left = c.endsAt ? Math.max(0, Math.round((new Date(`${c.endsAt}T23:59:59Z`).getTime() - Date.now()) / 864e5)) : null;
  const live = c.status === "running" && c.listingStatus === "eligible";

  return (
    <ModulePage identity={MODULES.promotions} title={c.itemName ?? workspace.businessName}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] text-neutral-600">{campaignType(c)}</span>
            {c.reviewStatus === "pending" && <span className="text-[13px] font-semibold text-gold-700">Waiting for Ascend&rsquo;s review. Nothing is charged before it starts.</span>}
            {c.reviewStatus === "declined" && <span className="text-[13px] font-semibold text-danger-ink">Not approved{c.reviewNote ? `: ${c.reviewNote}` : ""}</span>}
            <span className="text-[14px] text-ink">
              {[
                c.city ? `Near ${c.city}` : "On Discover",
                c.dailyBudget !== null ? `${formatGHS(c.dailyBudget)} a day` : `${formatGHS(c.budget)} budget`,
                c.reviewStatus === "approved" ? `from ${day(c.startsAt)}${c.endsAt ? ` to ${day(c.endsAt)}` : ""}` : c.days ? `${c.days} days once approved` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <StatusPill tone={live ? "ok" : c.status === "paused" ? "mute" : "mute"}>
              {live ? (left !== null ? `Live · ${left} day${left === 1 ? "" : "s"} left` : "Live") : c.status === "paused" ? "Paused by you" : c.status === "exhausted" ? "Budget used up" : "Ended"}
            </StatusPill>
            {(c.status === "paused" || live) && <CampaignToggle campaignId={c.id} paused={c.status === "paused"} />}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label="Seen" value={count(c.seen)} sub="On Discover" />
          <Figure label="Clicks" value={count(c.clicks)} sub={c.seen > 0 ? `${((c.clicks / c.seen) * 100).toFixed(1)}% of people who saw it` : "Not seen yet"} />
          <Figure label={c.itemKind === "service" ? "Bookings" : "Orders"} value={count(sold)} sub={c.sales > 0 ? `${formatGHS(c.sales)} in sales` : "Within 7 days of a click"} />
          <Figure label="Earned per GHS 1 spent" value={perCedi === null ? "Not yet" : formatGHS(Math.round(perCedi * 100) / 100)} sub={perCedi === null ? (c.spent > 0 ? "Counted from the next order a click brings" : "Once it has spent something") : `${formatGHS(c.sales)} from ${formatGHS(c.spent)}`} />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
            <h2 className="font-heading text-base font-bold text-ink-heading">Clicks and orders by day</h2>
            {days.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-neutral-600">Nothing yet. Days show here once people see it.</p>
            ) : (
              <>
                <div className="mt-4 flex h-[150px] items-end gap-1.5" role="img" aria-label={`Clicks by day over ${days.length} days`}>
                  {days.map((d) => (
                    <span key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      {d.orders + d.bookings > 0 && <span aria-hidden className="h-2 w-2 rounded-full bg-gold" />}
                      <span className="w-full rounded-t-[4px] bg-teal-brand" style={{ height: `${Math.max(2, (d.clicks / peak) * 100)}%` }} />
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[11.5px] text-neutral-600">
                  <span>{day(days[0].day)}</span>
                  <span>{day(days[days.length - 1].day)}</span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-gold" /> A day with an order or booking
                </p>
              </>
            )}
          </section>

          <div className="flex flex-col gap-4">
            <section className="rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
              <h2 className="font-heading text-base font-bold text-ink-heading">Where orders came from</h2>
              {where.size === 0 ? (
                <p className="mt-2 text-[13px] text-neutral-600">No orders traced to this campaign yet.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-1.5 text-[13px]">
                  {Array.from(where.entries()).map(([k, v]) => (
                    <span key={k} className="flex justify-between">
                      <span className="text-neutral-700">{k}</span>
                      <span className="num font-semibold text-ink">{v}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
              <h2 className="font-heading text-base font-bold text-ink-heading">Spend</h2>
              <p className="num mt-1 font-heading text-[22px] font-extrabold text-ink-heading">
                {formatGHS(c.spent)} <span className="text-[14px] font-semibold text-neutral-600">of {formatGHS(c.budget)}</span>
              </p>
              <span className="mt-2 block h-2 overflow-hidden rounded-full bg-neutral-100">
                <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (c.spent / Math.max(c.budget, 0.01)) * 100)}%` }} />
              </span>
              <p className="mt-2 text-xs text-neutral-600">
                Charged to your Ascend Balance at {formatGHS(c.costPerClick)} a click. Sponsored credit is used before your own money.
              </p>
              <Link href="/promote/balance" className={`${secondaryAction} mt-3 min-h-[40px]`}>
                See the Balance
              </Link>
            </section>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-neutral-600">
          Attributed sales count orders in your Shop and bookings made within 7 days of a click on Discover. A sale at the till cannot be traced to a click, so it is not counted here.
        </p>
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
