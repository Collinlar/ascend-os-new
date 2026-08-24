import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/nav/workspace";
import { supabaseServer } from "@/lib/supabase";
import { originFromRequest } from "@/lib/origin";
import { formatGHS } from "@/lib/money";
import ShopLink from "@/components/shop/ShopLink";

export const dynamic = "force-dynamic";

// The Shop set's own home.
//
// Everything about the shop used to live on the business dashboard: the
// link, the switch, the state. That made the dashboard the place where
// every product set piles up, which is the opposite of a merchant coming
// in for the one thing they need. A shop has its own front door now, and
// what the shop knows about itself is behind it.

interface ShopState {
  slug: string | null;
  listed: number;
  sellable: number;
  waiting: number;
  working: number;
  takings: number;
}

async function loadShop(businessId: string): Promise<ShopState> {
  const db = supabaseServer();

  const [slugRow, listed, sellable, orders] = await Promise.all([
    db.from("business").select("shop_slug").eq("id", businessId).maybeSingle(),
    db
      .from("catalogue_item")
      .select("id, channel_listing!inner(channel, visible)", {
        count: "exact",
        head: true,
      })
      .eq("business_id", businessId)
      .eq("active", true)
      .eq("channel_listing.channel", "shop")
      .eq("channel_listing.visible", true),
    db
      .from("catalogue_item")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true)
      .not("base_price", "is", null),
    db
      .from("shop_order")
      .select("status, total, placed_at")
      .eq("business_id", businessId)
      .gte("placed_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  const rows = (orders.data ?? []) as Array<{ status: string; total: number }>;
  const working = rows.filter((o) =>
    ["confirmed", "preparing", "ready", "out_for_delivery"].includes(o.status)
  ).length;

  return {
    slug: (slugRow.data?.shop_slug as string | null) ?? null,
    listed: listed.count ?? 0,
    sellable: sellable.count ?? 0,
    waiting: rows.filter((o) => o.status === "pending").length,
    working,
    takings: rows
      .filter((o) => o.status === "fulfilled")
      .reduce((sum, o) => sum + Number(o.total), 0),
  };
}

export default async function ShopHome() {
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) redirect("/onboarding");

  // Not a paywall. A business without the shop is sent to the room where
  // taking it on is explained, rather than shown a door that does nothing.
  if (!workspace.capabilities.has("shop.storefront")) redirect("/grow");

  const shop = await loadShop(workspace.businessId).catch(
    (): ShopState => ({
      slug: null,
      listed: 0,
      sellable: 0,
      waiting: 0,
      working: 0,
      takings: 0,
    })
  );

  const url = shop.slug ? `${originFromRequest()}/s/${shop.slug}` : null;
  const empty = shop.listed === 0;

  return (
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <p className="text-xs text-mid-grey">{workspace.businessName}</p>
          <h1 className="text-lg font-semibold text-ink">Your shop</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        {/* A shop that is open with nothing on it is the failure nobody
            sees, because the page loads perfectly and is simply empty. */}
        {empty && (
          <section className="border border-l-4 border-line border-l-gold bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">
              Your page is open, but there is nothing on it yet.
            </h2>
            <p className="mt-1 text-sm text-mid-grey">
              {shop.sellable > 0
                ? `You have ${shop.sellable} product${
                    shop.sellable === 1 ? "" : "s"
                  } with a price. Put them on your shop page and customers can order them.`
                : "Add what you sell, with a price, and it can go on your shop page."}
            </p>
            <Link
              href="/products"
              className="tap mt-4 inline-flex items-center bg-teal px-5 font-semibold text-white"
            >
              {shop.sellable > 0 ? "Put my products on the shop" : "Add what I sell"}
            </Link>
          </section>
        )}

        <ShopLink shopUrl={url} businessName={workspace.businessName} />

        <section className="grid gap-4 sm:grid-cols-3">
          <Card
            label="Waiting for you"
            value={String(shop.waiting)}
            detail={
              shop.waiting === 0
                ? "No new orders to decide on"
                : "New orders nobody has answered"
            }
            tone={shop.waiting > 0 ? "gold" : "plain"}
          />
          <Card
            label="Being prepared"
            value={String(shop.working)}
            detail={
              shop.working === 0 ? "Nothing in progress" : "Confirmed, not yet handed over"
            }
          />
          <Card
            label="Shop takings"
            value={formatGHS(shop.takings)}
            detail="Fulfilled orders, last 30 days"
          />
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white px-4 py-3">
          <p className="text-sm text-mid-grey">
            <span className="font-medium text-ink">{shop.listed}</span> on your shop
            page, out of {shop.sellable} you can sell
          </p>
          <Link
            href="/products"
            className="tap flex items-center text-sm font-medium text-teal-dark"
          >
            Choose what shows
          </Link>
        </section>

        <Link
          href="/orders"
          className="tap flex items-center justify-between border border-line bg-white px-4 py-4"
        >
          <span className="text-sm font-medium text-ink">Every order</span>
          <span className="text-sm text-teal-dark">Open the order list</span>
        </Link>
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  detail,
  tone = "plain",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "plain" | "gold";
}) {
  return (
    <div
      className={`bg-white px-4 py-4 ${
        tone === "gold" ? "border border-l-4 border-line border-l-gold" : "border border-line"
      }`}
    >
      <p className="text-sm text-mid-grey">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-mid-grey">{detail}</p>
    </div>
  );
}
