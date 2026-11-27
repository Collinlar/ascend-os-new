import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell, Panel, PanelRow } from "@/components/shell/Page";
import { Icon, type IconName } from "@/components/shell/icons";
import { formatGHS, formatMoney } from "@/lib/money";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Plan and billing (v3 design, D3): what the business has, and why.
//
// Left: what is active on the business and on what terms (free to start,
// bought, paid for by a sponsor, given by Ascend), what it has bought, and
// the offers that exist for its country. Right: the Ascend Balance, split
// into the business's own top-ups and sponsor credit, and what it was last
// spent on. Nothing here renews on its own and nothing is billed monthly.

const SET_ICON: Record<string, IconName> = {
  pos: "sell",
  shop: "store",
  services: "calendar",
  documents: "file",
  office: "clipboard",
  discover: "target",
  readiness: "shield",
};

const SOURCE: Record<string, { kind: string; cls: string; why: string }> = {
  free_start: { kind: "Free", cls: "bg-teal-50 text-teal-800", why: "Free with your Ascend account" },
  purchase: { kind: "Paid", cls: "bg-info-light text-info-ink", why: "You bought this" },
  sponsorship: { kind: "Sponsored", cls: "bg-gold-100 text-gold-700", why: "Paid for by a sponsor" },
  promotion: { kind: "Offer", cls: "bg-gold-100 text-gold-700", why: "Part of an Ascend offer" },
  support_grant: { kind: "From Ascend", cls: "bg-neutral-100 text-neutral-700", why: "Given by the Ascend team" },
};

const KIND_LABEL: Record<string, string> = {
  duration_pass: "Passes",
  capacity: "More room",
  promotion: "Being found",
  verification: "Getting checked",
  one_time: "Setting up",
  hardware: "Equipment",
};

const SERVICE_LABEL: Array<[RegExp, string]> = [
  [/^messaging\.refund/, "Message refunded"],
  [/^messaging\./, "Customer messages"],
  [/^discover\.promotion/, "Discover promotion"],
  [/^discover\.click/, "Discover visit"],
  [/^discover\./, "Discover"],
];

interface ActiveRow {
  key: string;
  name: string;
  description: string;
  source: string;
  startsAt: string;
  expiresAt: string | null;
  inGrace: boolean;
}

async function load() {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;
    const businessId = membership.business_id;
    const now = new Date().toISOString();

    const [offers, bought, grants, balance] = await Promise.all([
      db.rpc("price_book", { p_business: businessId }),
      db.rpc("business_purchases", { p_business: businessId }),
      // In force the way business_entitlements (0069) decides it: started,
      // and not yet expired unless a grace period is holding it open.
      db
        .from("entitlement")
        .select("product_set_key, source, starts_at, expires_at, grace_until, status, product_set:product_set_key(name, description)")
        .eq("business_id", businessId)
        .in("status", ["active", "grace"])
        .not("product_set_key", "is", null)
        .lte("starts_at", now)
        .order("starts_at"),
      db
        .from("balance_entry")
        .select("kind, amount, service_key, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const active = new Map<string, ActiveRow>();
    for (const g of (grants.data ?? []) as Array<Record<string, unknown>>) {
      const expires = g.expires_at as string | null;
      const grace = g.grace_until as string | null;
      const live = !expires || expires > now || (grace !== null && grace > now);
      if (!live) continue;
      const key = g.product_set_key as string;
      const set = g.product_set as { name: string; description: string } | null;
      const row: ActiveRow = {
        key,
        name: set?.name ?? key,
        description: set?.description ?? "",
        source: g.source as string,
        startsAt: g.starts_at as string,
        expiresAt: expires,
        inGrace: !!expires && expires <= now,
      };
      // One row per product: the longest-lasting grant wins.
      const prev = active.get(key);
      if (!prev || (prev.expiresAt && (!row.expiresAt || row.expiresAt > prev.expiresAt))) active.set(key, row);
    }

    const entries = (balance.data ?? []) as Array<{ kind: string; amount: number; service_key: string | null; created_at: string }>;
    const sum = (kinds: string[]) => entries.filter((e) => kinds.includes(e.kind)).reduce((n, e) => n + Number(e.amount), 0);
    const total = entries.reduce((n, e) => n + Number(e.amount), 0);

    return {
      offers: (offers.data ?? []) as Array<Record<string, unknown>>,
      bought: (bought.data ?? []) as Array<Record<string, unknown>>,
      active: Array.from(active.values()),
      balance: {
        total: Math.round(total * 100) / 100,
        topUps: sum(["top_up"]),
        sponsored: sum(["sponsor_credit", "promo_credit"]),
        uses: entries.filter((e) => e.kind === "deduction" || e.kind === "reversal").slice(0, 6),
        hasHistory: entries.length > 0,
      },
    };
  } catch {
    return null;
  }
}

export default async function Billing() {
  await checkPageAccess("/billing");

  const data = await load();

  if (data === null) {
    return (
      <PageShell>
        <PageHeader title="Plans and billing" />
        <EmptyState
          title="Sign in to see this."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      </PageShell>
    );
  }

  const available = data.offers.filter((o) => !(o.already_owned as boolean));
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const offer of available) {
    const kind = offer.kind as string;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(offer);
  }

  return (
    <PageShell>
      <PageHeader
        title="Plans and billing"
        intro="What you have, and why. Nothing renews on its own and nothing is billed monthly: you buy a thing, keep it for the time it says, and it stops."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Active on your business</h2>
            {data.active.length === 0 ? (
              <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-600">Nothing is switched on yet.</p>
            ) : (
              data.active.map((a) => {
                const src = SOURCE[a.source] ?? { kind: a.source, cls: "bg-neutral-100 text-neutral-700", why: "" };
                return (
                  <div key={a.key} className="flex items-center gap-3.5 border-t border-neutral-100 px-5 py-3">
                    <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-teal-50 text-teal-700">
                      <Icon name={SET_ICON[a.key] ?? "grid"} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-bold text-ink">{a.name}</span>
                      <span className="text-[12.5px] text-neutral-500">
                        {src.why}
                        {a.source === "purchase" || a.source === "sponsorship" ? `, ${day(a.startsAt)}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-none flex-col items-end gap-1">
                      <span className={`rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${src.cls}`}>{src.kind}</span>
                      <span className={`text-xs ${a.inGrace ? "font-semibold text-gold-700" : "text-neutral-500"}`}>
                        {a.inGrace ? "Ended, still open for a short while" : a.expiresAt ? `Until ${day(a.expiresAt)}` : "Always"}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </Panel>

          {data.bought.length > 0 && (
            <Panel>
              <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">What you have bought</h2>
              {data.bought.map((p, i) => (
                <PanelRow key={p.purchase_id as string} last={i === data.bought.length - 1} className="border-t border-neutral-100">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{p.description as string}</p>
                    <p className="text-[12.5px] text-neutral-500">
                      {p.expires_at
                        ? (p.still_running as boolean)
                          ? `Runs until ${day(p.expires_at as string)}`
                          : `Ran out ${day(p.expires_at as string)}`
                        : "Yours to keep"}
                      {(p.sponsored as boolean) && ", paid by a sponsor"}
                    </p>
                  </div>
                  <span className="num flex-none text-[13.5px] font-bold text-ink">
                    {formatMoney(Number(p.amount), p.currency_code as string)}
                  </span>
                </PanelRow>
              ))}
            </Panel>
          )}

          {data.offers.length === 0 ? (
            <EmptyState title="Nothing is priced for your country yet." detail="Everything you are using stays as it is." />
          ) : available.length > 0 ? (
            <Panel>
              <div className="px-5 pb-2 pt-4">
                <h2 className="font-heading text-base font-bold text-ink-heading">Worth considering</h2>
                <p className="text-[12.5px] text-neutral-500">
                  What you can add. Everything you already have comes with it. Talk to us to switch one on.
                </p>
              </div>
              {Array.from(groups.entries()).map(([kind, offers]) => (
                <div key={kind}>
                  <p className="border-t border-neutral-100 bg-neutral-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">
                    {KIND_LABEL[kind] ?? kind}
                  </p>
                  {offers.map((o) => (
                    <div key={o.sku as string} className="flex items-center gap-3 border-t border-neutral-100 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[14px] font-semibold text-ink">{o.name as string}</span>
                        <span className="text-[12.5px] text-neutral-500">{describe(o)}</span>
                      </span>
                      <span className="num flex-none text-[14px] font-bold text-ink">
                        {formatMoney(Number(o.amount), o.currency_code as string)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </Panel>
          ) : null}

          <p className="text-[12.5px] text-neutral-500">
            These are the prices we are testing in Ghana. Nothing is charged until you agree to it, and no card is kept on file.
          </p>
        </div>

        {/* On the phone the Balance comes first, so it is not under the price list. */}
        <div className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
          <Panel className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">Ascend Balance</p>
            <p className="num mt-1 font-heading text-[28px] font-extrabold text-ink-heading">{formatGHS(data.balance.total)}</p>
            <div className="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2 text-[13px]">
              <span className="flex justify-between">
                <span className="text-neutral-600">Your top-ups</span>
                <strong className="num font-semibold text-ink">{formatGHS(data.balance.topUps)}</strong>
              </span>
              <span className="flex justify-between">
                <span className="text-neutral-600">Sponsored and promotional</span>
                <strong className="num font-semibold text-ink">{formatGHS(data.balance.sponsored)}</strong>
              </span>
              {/* What came in, less what was used, is the total above. */}
              {Math.abs(data.balance.total - data.balance.topUps - data.balance.sponsored) >= 0.005 && (
                <span className="flex justify-between">
                  <span className="text-neutral-600">Used so far</span>
                  <strong className="num font-semibold text-ink">
                    {formatGHS(Math.round((data.balance.total - data.balance.topUps - data.balance.sponsored) * 100) / 100)}
                  </strong>
                </span>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-neutral-500">
              Pays for Ascend services such as customer messages and Discover. It is separate from your sales money.
            </p>
          </Panel>

          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Recent Balance use</h2>
            {data.balance.uses.length === 0 ? (
              <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-600">
                {data.balance.hasHistory ? "Nothing spent from your Balance yet." : "No Balance activity yet."}
              </p>
            ) : (
              data.balance.uses.map((u, i) => (
                <div key={`${u.created_at}-${i}`} className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-2.5 text-[13px]">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ink">{serviceLabel(u.service_key, u.kind)}</span>
                    <span className="text-xs text-neutral-500">{day(u.created_at)}</span>
                  </span>
                  <span className={`num flex-none font-semibold ${Number(u.amount) < 0 ? "text-ink" : "text-success-ink"}`}>
                    {Number(u.amount) < 0 ? "-" : "+"}
                    {formatGHS(Math.abs(Number(u.amount)))}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}

function serviceLabel(key: string | null, kind: string): string {
  if (kind === "reversal") return "Returned to your Balance";
  if (!key) return "Ascend service";
  return SERVICE_LABEL.find(([re]) => re.test(key))?.[1] ?? "Ascend service";
}

function describe(o: Record<string, unknown>): string {
  const days = o.duration_days as number | null;
  const capacity = o.capacity as Record<string, number> | null;
  const parts: string[] = [];

  if (days === 365) parts.push("for a year");
  else if (days === 30) parts.push("for a month");
  else if (days === 7) parts.push("for a week");
  else if (days) parts.push(`for ${days} days`);
  else parts.push("once, and it stays");

  if (capacity?.staff) parts.push(`up to ${capacity.staff} people`);
  if (capacity?.products) parts.push(`${capacity.products} products`);
  if (capacity?.locations) parts.push(`${capacity.locations} place${capacity.locations === 1 ? "" : "s"}`);

  return parts.join(" · ");
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
