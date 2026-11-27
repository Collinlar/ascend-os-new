import Link from "next/link";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { Card, Pill, day } from "@/components/billing/Parts";
import { MODULES, billingTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { supabaseServer } from "@/lib/supabase";
import { ghs, loadBilling } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// Usage and receipts (round 3, P4), from the design: what the Balance paid
// for this month, every order and payment to Ascend with its receipt, how
// the business pays Ascend, and the details on its receipts.

const PAID_WITH: Record<string, string> = { bank_transfer: "Bank transfer", momo: "MoMo", cash: "Cash", card: "Card" };

export default async function UsagePage() {
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
  const db = supabaseServer();
  const monthStart = `${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" }).slice(0, 7)}-01T00:00:00Z`;
  const [spend, look] = await Promise.all([
    db.from("balance_entry").select("amount, service_key, kind, restricted_to").eq("business_id", workspace.businessId).in("kind", ["deduction", "reversal"]).gte("created_at", monthStart).limit(5000),
    db.from("document_branding").select("trading_name, tin, email").eq("business_id", workspace.businessId).maybeSingle(),
  ]);
  const rows = (spend.data ?? []) as Array<{ amount: number; service_key: string | null }>;
  const sum = (re: RegExp) => -rows.filter((r) => re.test(r.service_key ?? "")).reduce((n, r) => n + Number(r.amount), 0);
  const count = (re: RegExp) => rows.filter((r) => re.test(r.service_key ?? "") && Number(r.amount) < 0).length;
  const promotion = sum(/^discover\./);
  const messages = sum(/^messaging\./);
  const sent = count(/^messaging\./);
  const total = Math.max(0, promotion + messages);
  const purchases = d.orders.filter((o) => o.status !== "cancelled");

  return (
    <ModulePage identity={MODULES.billing} tabs={billingTabs("/billing/usage")}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Meter title="Customer messages" value={`${sent} sent this month`} sub={`${ghs(messages)} from your Balance`} />
            <Meter title="Discover promotion" value={`${ghs(promotion)} this month`} sub={d.balance.sponsored > 0 ? "Sponsored credit is used first" : "From your Balance"} />
            <Meter title="Smart Setup and message packs" value="Coming" sub="Packs you buy once, with a meter here" />
          </div>

          <Card className="!px-0 !py-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pb-2 pt-4 sm:px-5">
              <h2 className="font-heading text-base font-bold text-ink-heading">Ascend purchases and receipts</h2>
              <Link href="/billing/get/top-up" className={`${secondaryAction} min-h-[40px]`}>Top up your Balance</Link>
            </div>
            {purchases.length === 0 ? (
              <p className="border-t border-neutral-100 px-[18px] py-4 text-[13.5px] text-neutral-600 sm:px-5">Nothing bought from Ascend yet.</p>
            ) : (
              purchases.map((o) => (
                <div key={o.id} className="flex flex-col gap-1.5 border-t border-neutral-100 px-[18px] py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14px] font-semibold text-ink">{o.kind === "top_up" ? "Ascend Balance top-up" : o.description}</span>
                    <span className="text-[12.5px] text-neutral-500">
                      {day(o.recordedAt ?? o.requestedAt)} · <span className="font-mono">{o.reference}</span>
                      {o.paidWith ? ` · ${PAID_WITH[o.paidWith] ?? o.paidWith}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-none items-center justify-between gap-3">
                    <span className="num text-[14px] font-bold text-ink">{ghs(o.amount)}</span>
                    {o.status === "paid" ? (
                      <Link href={`/billing/receipt/${o.id}`} className="tap flex min-h-[44px] items-center gap-2 text-[13px] font-bold text-teal-700 hover:text-teal-800">
                        <Pill tone="ok">Paid</Pill> Receipt
                      </Link>
                    ) : (
                      <Link href={o.kind === "top_up" ? "/billing/get/top-up" : `/billing/get/${o.sku}`} className="tap flex min-h-[44px] items-center">
                        <Pill tone="warn">Waiting for payment</Pill>
                      </Link>
                    )}
                  </span>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-heading text-base font-bold text-ink-heading">Spend this month</h2>
              <span className="num font-heading text-[20px] font-extrabold text-ink-heading">{ghs(total)}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-[13px]">
              <span className="flex justify-between gap-3"><span className="text-neutral-600">Discover promotion</span><span className="num font-semibold text-ink">{ghs(promotion)}</span></span>
              <span className="flex justify-between gap-3"><span className="text-neutral-600">Customer messages</span><span className="num font-semibold text-ink">{ghs(messages)}</span></span>
            </div>
            <p className="mt-2 text-[12.5px] text-neutral-500">From your Ascend Balance, {ghs(d.balance.total)} left.</p>
          </Card>

          <Card>
            <h2 className="font-heading text-base font-bold text-ink-heading">How you pay Ascend</h2>
            <div className="mt-2 flex flex-col gap-2 text-[13px]">
              <span className="flex items-center justify-between gap-3"><span className="text-ink">Bank transfer or MoMo to Ascend</span><Pill tone="teal">Now</Pill></span>
              <span className="flex items-center justify-between gap-3"><span className="text-neutral-600">MoMo or card in the app</span><Pill tone="mute">Coming</Pill></span>
            </div>
            <p className="mt-2 text-[12.5px] text-neutral-500">Ascend never takes money from your sales or settlements.</p>
          </Card>

          <Card>
            <h2 className="font-heading text-base font-bold text-ink-heading">Billing details</h2>
            <div className="mt-2 flex flex-col gap-1.5 text-[13px]">
              <span className="flex justify-between gap-3"><span className="text-neutral-600">Business</span><span className="text-right text-ink">{(look.data?.trading_name as string) || d.businessName}</span></span>
              <span className="flex justify-between gap-3"><span className="text-neutral-600">TIN</span><span className="text-right text-ink">{(look.data?.tin as string) || "Not added"}</span></span>
              <span className="flex justify-between gap-3"><span className="text-neutral-600">Email on receipts</span><span className="break-all text-right text-ink">{(look.data?.email as string) || "Not added"}</span></span>
            </div>
            <Link href="/documents/look" className="tap mt-1 inline-flex min-h-[44px] items-center text-[13px] font-bold text-teal-700 hover:text-teal-800">Change these details</Link>
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}

function Meter({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
      <span className="text-[12.5px] text-neutral-600">{title}</span>
      <strong className="font-heading text-[17px] text-ink-heading">{value}</strong>
      <span className="text-[12px] text-neutral-500">{sub}</span>
    </div>
  );
}
