import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, FigureRow, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import { formatGHS } from "@/lib/money";

export const dynamic = "force-dynamic";

// Ascend's own income, month by month (D7 plan, decision 4): what
// businesses bought, what a sponsor paid for them, Balance topped up, and
// what the Balance was spent on (promotion, customer messages). Not the
// businesses' own sales: that is their money, not Ascend's. Settlements wait
// for Paystack.

interface Month {
  key: string;
  label: string;
  bought: number;
  sponsoredBuys: number;
  topUps: number;
  sponsorCredit: number;
  promotion: number;
  messaging: number;
}

function monthsBack(n: number): Month[] {
  const out: Month[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < n; i += 1) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push({
      key: m.toISOString().slice(0, 7),
      label: m.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      bought: 0,
      sponsoredBuys: 0,
      topUps: 0,
      sponsorCredit: 0,
      promotion: 0,
      messaging: 0,
    });
  }
  return out;
}

export default async function Revenue() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  const months = monthsBack(6);
  const since = `${months[months.length - 1].key}-01T00:00:00Z`;
  const db = supabaseServer();
  const [purchases, balance] = await Promise.all([
    db.from("purchase").select("amount, sponsor_id, created_at").gte("created_at", since).limit(20000),
    db.from("balance_entry").select("kind, amount, service_key, created_at").gte("created_at", since).limit(50000),
  ]);
  const byKey = new Map(months.map((m) => [m.key, m]));

  for (const p of purchases.data ?? []) {
    const m = byKey.get((p.created_at as string).slice(0, 7));
    if (!m) continue;
    if (p.sponsor_id) m.sponsoredBuys += Number(p.amount);
    else m.bought += Number(p.amount);
  }
  for (const e of balance.data ?? []) {
    const m = byKey.get((e.created_at as string).slice(0, 7));
    if (!m) continue;
    const amount = Number(e.amount);
    const key = (e.service_key as string | null) ?? "";
    if (e.kind === "top_up") m.topUps += amount;
    else if (e.kind === "sponsor_credit" || e.kind === "promo_credit") m.sponsorCredit += amount;
    else if (e.kind === "deduction" && key.startsWith("discover.")) m.promotion += -amount;
    else if (e.kind === "deduction" && key.startsWith("messaging.")) m.messaging += -amount;
  }

  const sum = (f: (m: Month) => number) => months.reduce((n, m) => n + f(m), 0);
  const anything = sum((m) => m.bought + m.sponsoredBuys + m.topUps + m.sponsorCredit + m.promotion + m.messaging) !== 0;
  const cell = "num px-3 py-2.5 text-right";

  return (
    <PageShell>
      <PageHeader title="Revenue" intro="Ascend's own income, by month. Not the businesses' sales, which are theirs." />

      <FigureRow
        figures={[
          { label: "Bought by businesses", value: formatGHS(sum((m) => m.bought)), sub: "Last 6 months" },
          { label: "Paid by sponsors", value: formatGHS(sum((m) => m.sponsoredBuys)), sub: "Purchases a sponsor covered" },
          { label: "Balance topped up", value: formatGHS(sum((m) => m.topUps)), sub: `${formatGHS(sum((m) => m.sponsorCredit))} sponsored credit on top` },
          { label: "Spent from Balance", value: formatGHS(sum((m) => m.promotion + m.messaging)), sub: "Promotion and customer messages" },
        ]}
      />

      {!anything ? (
        <EmptyState title="No income recorded in the last six months." detail="Purchases and Balance top-ups appear here as they happen." />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="bg-neutral-50 text-[11.5px] uppercase tracking-[0.06em] text-neutral-500">
                <th className="px-5 py-2.5 text-left font-semibold">Month</th>
                <th className="px-3 py-2.5 text-right font-semibold">Bought</th>
                <th className="px-3 py-2.5 text-right font-semibold">Sponsor paid</th>
                <th className="px-3 py-2.5 text-right font-semibold">Topped up</th>
                <th className="px-3 py-2.5 text-right font-semibold">Sponsored credit</th>
                <th className="px-3 py-2.5 text-right font-semibold">Promotion</th>
                <th className="px-5 py-2.5 text-right font-semibold">Messages</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-t border-neutral-100 text-ink">
                  <td className="px-5 py-2.5 font-semibold">{m.label}</td>
                  <td className={cell}>{formatGHS(m.bought)}</td>
                  <td className={cell}>{formatGHS(m.sponsoredBuys)}</td>
                  <td className={cell}>{formatGHS(m.topUps)}</td>
                  <td className={cell}>{formatGHS(m.sponsorCredit)}</td>
                  <td className={cell}>{formatGHS(m.promotion)}</td>
                  <td className={`${cell} pr-5`}>{formatGHS(m.messaging)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <p className="mt-3 text-[12.5px] text-neutral-600">
        Payments through Ascend, and settlements to businesses, appear once Paystack is live.
      </p>
    </PageShell>
  );
}
