import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell, Panel, PanelRow } from "@/components/shell/Page";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

// What a business can buy, and what it has bought.
//
// MON-005 says every charge shows what it buys, for how long, and how much,
// before payment. MON-020 says purchases, balances, entitlements and
// renewal dates live in one place. This is that place.
//
// Nothing here takes money yet. Paystack and Ascend Balance both settle
// elsewhere and record_purchase writes what the money bought; this screen
// is the offer and the receipt, which is the half that was missing.

const KIND_LABEL: Record<string, string> = {
  duration_pass: "Passes",
  capacity: "More room",
  promotion: "Being found",
  verification: "Getting checked",
  one_time: "Setting up",
  hardware: "Equipment",
};

async function load() {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const [offers, bought] = await Promise.all([
      db.rpc("price_book", { p_business: membership.business_id }),
      db.rpc("business_purchases", { p_business: membership.business_id }),
    ]);

    return {
      offers: (offers.data ?? []) as Array<Record<string, unknown>>,
      bought: (bought.data ?? []) as Array<Record<string, unknown>>,
    };
  } catch {
    return null;
  }
}

export default async function Billing() {
  const data = await load();

  if (data === null) {
    return (
      <PageShell>
        <PageHeader title="What you pay for" />
        <EmptyState
          title="Sign in to see this."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      </PageShell>
    );
  }

  // Grouped by what the merchant is actually deciding between, rather than
  // listed as one long price list.
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const offer of data.offers) {
    const kind = offer.kind as string;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(offer);
  }

  return (
    <PageShell>
      <PageHeader
        title="What you pay for"
        intro="Nothing here renews on its own and nothing is billed monthly. You buy a thing, you keep it for the time it says, and it stops."
      />

      {data.bought.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
            What you have bought
          </h2>
          <Panel>
            {data.bought.map((p, i) => (
              <PanelRow key={p.purchase_id as string} last={i === data.bought.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-snug text-ink">
                    {p.description as string}
                  </p>
                  <p className="text-[12.5px] font-medium text-slate-grey">
                    {p.expires_at
                      ? (p.still_running as boolean)
                        ? `runs until ${day(p.expires_at as string)}`
                        : `ran out ${day(p.expires_at as string)}`
                      : "yours to keep"}
                    {(p.sponsored as boolean) && " · paid by a sponsor"}
                  </p>
                </div>
                <span className="num flex-none text-[13.5px] font-extrabold text-ink">
                  {formatMoney(Number(p.amount), p.currency_code as string)}
                </span>
              </PanelRow>
            ))}
          </Panel>
        </div>
      )}

      {data.offers.length === 0 ? (
        <EmptyState
          title="Nothing is priced for your country yet."
          detail="Everything you are using stays as it is."
        />
      ) : (
        Array.from(groups.entries()).map(([kind, offers]) => (
          <div key={kind} className="mb-5">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
              {KIND_LABEL[kind] ?? kind}
            </h2>
            <Panel>
              {offers.map((o, i) => (
                <PanelRow key={o.sku as string} last={i === offers.length - 1}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-ink">
                      {o.name as string}
                    </p>
                    <p className="text-[12.5px] font-medium text-slate-grey">
                      {describe(o)}
                    </p>
                  </div>
                  <span className="num flex-none text-[15px] font-extrabold text-ink">
                    {formatMoney(Number(o.amount), o.currency_code as string)}
                  </span>
                  {(o.already_owned as boolean) ? (
                    <span className="flex-none rounded-chip bg-teal-light px-3 py-1 text-[12px] font-bold text-teal-dark">
                      You have this
                    </span>
                  ) : (
                    <span className="flex-none rounded-chip border border-line px-3 py-1 text-[12px] font-bold text-slate-grey">
                      Talk to us
                    </span>
                  )}
                </PanelRow>
              ))}
            </Panel>
          </div>
        ))
      )}

      <p className="mt-5 text-[12.5px] font-medium text-slate-grey">
        These are the prices we are testing in Ghana. Nothing is charged until
        you agree to it, and no card is kept on file.
      </p>
    </PageShell>
  );
}

// What the money actually buys, in the merchant's terms.
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
  return new Date(iso).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
