import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/shell/Module";
import { secondaryAction } from "@/components/shell/Page";
import { StatusPill } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import ShopLink from "@/components/shop/ShopLink";
import { MODULES, shopTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { originFromRequest } from "@/lib/origin";
import { formatGHS } from "@/lib/money";
import { loadShopOverview, type ShopOverview } from "@/lib/shop/overview";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Shop, Overview (Modules M6a). Whether the shop is live and what a
// customer is told about it; the last 30 days; what is selling and what is
// running low; what Discover brought; and what is waiting on the owner.
// Payment is on the day until online payments arrive, and the page says so
// rather than drawing a checkout funnel nothing measures.

export default async function ShopHome() {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/shop");

  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) redirect("/onboarding");
  // Not a paywall. A business without the shop is sent to the room where
  // taking it on is explained, rather than shown a door that does nothing.
  if (!workspace.capabilities.has("shop.storefront")) redirect("/grow");

  const o: ShopOverview | null = await loadShopOverview(workspace.businessId).catch(() => null);
  const url = o?.slug ? `${originFromRequest()}/s/${o.slug}` : null;
  const tabs = shopTabs(workspace.capabilities, "/shop", o?.waitingFor.confirm ?? 0);

  if (!o) {
    return (
      <ModulePage identity={MODULES.shop} tabs={tabs}>
        <p className="py-16 text-center text-neutral-600">We could not load your shop just now. Refresh in a moment.</p>
      </ModulePage>
    );
  }

  const live = o.listed > 0 && Boolean(url);
  const f = o.figures;
  const change = f.salesPrev30 > 0 ? Math.round(((f.sales30 - f.salesPrev30) / f.salesPrev30) * 100) : null;
  const w = o.waitingFor;
  const waitingTotal = w.confirm + w.pack + w.readyPickup + w.delivering + w.notPaid;

  return (
    <ModulePage
      identity={MODULES.shop}
      tabs={tabs}
      action={
        <Link href="/products/add" className="tap inline-flex min-h-[44px] items-center gap-2 rounded-control bg-teal px-4 text-[13.5px] font-bold text-white hover:bg-teal-hover">
          <Icon name="plus" size={16} />
          Add products
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-5 py-4 lg:flex-row lg:items-center">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-teal-50 text-teal-700">
            <Icon name="store" size={22} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="font-heading text-[17px] text-ink-heading">{live ? "Your Shop is live" : "Your Shop is not live yet"}</strong>
              <StatusPill tone="info">Pay on the day</StatusPill>
              {o.verified && (
                <StatusPill tone="teal">
                  <Icon name="shield" size={13} />
                  Verified business
                </StatusPill>
              )}
            </span>
            <span className="truncate text-[13px] text-neutral-600">
              {url ? url.replace(/^https?:\/\//, "") : "No shop address yet"} · {o.listed} product{o.listed === 1 ? "" : "s"} on it
              {o.places > 1 ? ` · ${o.places} places` : ""}
            </span>
            {!live && (
              <span className="text-[13px] font-semibold text-gold-700">
                {o.sellable > 0
                  ? `You have ${o.sellable} product${o.sellable === 1 ? "" : "s"} with a price. Put them on your shop and customers can order.`
                  : "Add what you sell, with a price, and it can go on your shop."}
              </span>
            )}
          </span>
          <span className="flex flex-none flex-wrap gap-2">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[40px]`}>
                See it as a customer
              </a>
            )}
            <Link href="/products" className={`${secondaryAction} min-h-[40px]`}>
              Choose what shows
            </Link>
          </span>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure
            label="Shop sales, last 30 days"
            value={formatGHS(f.sales30)}
            sub={change === null ? "Orders accepted, at their full value" : `${change >= 0 ? "Up" : "Down"} ${Math.abs(change)}% on the 30 days before`}
          />
          <Figure label="Orders" value={`${f.orders30} accepted`} sub={f.waiting ? `${f.waiting} waiting for you` : "None waiting for you"} warn={f.waiting > 0} />
          <Figure label="Paid, last 30 days" value={formatGHS(f.paid30)} sub={f.toCollect > 0.005 ? `${formatGHS(f.toCollect)} still to collect` : "Nothing left to collect"} />
          <Figure
            label="Repeat buyers"
            value={f.repeatShare === null ? "None yet" : `${f.repeatShare}%`}
            sub={f.shopCustomers ? `Of ${f.shopCustomers} Shop customer${f.shopCustomers === 1 ? "" : "s"}` : "Once someone orders"}
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card title="Selling now" aside={<Link href="/products" className="text-[13px] font-semibold text-teal-dark">All products</Link>}>
              {o.selling.length === 0 ? (
                <p className="text-sm text-neutral-600">Nothing sold on the shop in the last 30 days yet. Share your link on WhatsApp to bring the first order in.</p>
              ) : (
                o.selling.map((s, i) => (
                  <div key={s.itemId} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-600">
                      <Icon name="tag" size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="truncate text-[13.5px] text-ink">{s.name}</strong>
                      <span className="text-xs text-neutral-600">
                        {s.price !== null ? `${formatGHS(s.price)} · ` : ""}
                        {s.sold} sold
                      </span>
                    </span>
                    {s.stock === "out" && <StatusPill tone="bad">Out of stock</StatusPill>}
                    {s.stock === "low" && <StatusPill tone="warn">Low stock: {s.left}</StatusPill>}
                  </div>
                ))
              )}
            </Card>
            <ShopLink shopUrl={url} businessName={workspace.businessName} />
          </div>

          <div className="flex flex-col gap-4">
            <Card title="Waiting for you" aside={<Link href="/orders" className="text-[13px] font-semibold text-teal-dark">Orders</Link>}>
              {waitingTotal === 0 ? (
                <p className="text-sm text-neutral-600">Nothing waiting. Every order is answered, handed over and paid.</p>
              ) : (
                <div className="flex flex-col gap-2 text-[13.5px]">
                  {w.confirm > 0 && <Wait label="To confirm" n={w.confirm} tone="warn" />}
                  {w.pack > 0 && <Wait label="To pack" n={w.pack} tone="info" />}
                  {w.readyPickup > 0 && <Wait label="Ready for pickup" n={w.readyPickup} tone="ok" />}
                  {w.delivering > 0 && <Wait label="Out for delivery" n={w.delivering} tone="teal" />}
                  {w.notPaid > 0 && <Wait label="Handed over, not recorded as paid" n={w.notPaid} tone="bad" />}
                </div>
              )}
            </Card>
            {workspace.capabilities.has("discover.listing") && (
              <section className="flex flex-col gap-2 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-teal-700">
                  <Icon name="target" size={15} />
                  Discover
                </span>
                <strong className="text-[14px] text-ink">
                  {o.discover.visits30 + o.discover.clicks30 > 0
                    ? `${o.discover.visits30 + o.discover.clicks30} people came from Discover in 30 days`
                    : o.discover.listed
                      ? "Nobody has come from Discover in 30 days yet"
                      : "You are not on Discover yet"}
                </strong>
                <span className="text-[12.5px] leading-relaxed text-neutral-700">
                  Customers nearby find you on Discover. Promoting puts you higher, marked Sponsored.
                </span>
                <Link href="/promote" className="tap flex min-h-[40px] items-center gap-1 self-start text-[13px] font-bold text-teal-dark">
                  Promote your shop
                  <Icon name="chev" size={15} />
                </Link>
              </section>
            )}
          </div>
        </div>
      </div>
    </ModulePage>
  );
}

function Figure({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
      <span className="text-[12.5px] text-neutral-600">{label}</span>
      <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{value}</span>
      <span className={`text-xs ${warn ? "font-semibold text-gold-700" : "text-neutral-600"}`}>{sub}</span>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-bold text-ink-heading">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Wait({ label, n, tone }: { label: string; n: number; tone: "warn" | "info" | "ok" | "teal" | "bad" }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="text-ink">{label}</span>
      <StatusPill tone={tone}>{String(n)}</StatusPill>
    </span>
  );
}
