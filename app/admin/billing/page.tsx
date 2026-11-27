import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import { RecordPayment, RecordTopUp } from "@/components/admin/BillingDesk";
import { ghs } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// Payments to Ascend (round 3, P4). Until Paystack, a business asks in the
// app and pays by transfer quoting its reference; this is where the money
// is recorded and the thing switches on. A transfer that arrives without
// an order is recorded as a top-up.

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", year: "numeric" });
const PAID_WITH: Record<string, string> = { bank_transfer: "Bank transfer", momo: "MoMo", cash: "Cash", card: "Card" };

export default async function AdminBilling() {
  const admin = await currentAdmin();
  if (!admin) notFound();
  const db = supabaseServer();
  const [waiting, recent, businesses] = await Promise.all([
    db.from("ascend_order").select("id, reference, kind, description, amount, requested_at, business:business_id(id, name)").eq("status", "waiting").order("requested_at").limit(200),
    db.from("ascend_order").select("id, reference, kind, description, amount, recorded_at, paid_with, payment_reference, business:business_id(id, name)").eq("status", "paid").order("recorded_at", { ascending: false }).limit(30),
    db.from("business").select("id, name").order("name").limit(1000),
  ]);
  const ready = !waiting.error;
  const w = (waiting.data ?? []) as Array<Record<string, unknown>>;
  const r = (recent.data ?? []) as Array<Record<string, unknown>>;
  const name = (x: Record<string, unknown>) => (x.business as { name: string } | null)?.name ?? "A business";
  const bizId = (x: Record<string, unknown>) => (x.business as { id: string } | null)?.id ?? "";

  return (
    <PageShell>
      <PageHeader
        title="Payments to Ascend"
        intro="Orders waiting for their money, oldest first. Check the transfer against the statement before recording it: recording switches the thing on, or adds the money to the Balance."
      />
      {!ready ? (
        <EmptyState title="This needs this week's update (0149)." detail="Orders to Ascend start once it has run." />
      ) : (
        <div className="flex flex-col gap-4">
          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">
              Waiting for payment {w.length > 0 && <span className="text-neutral-500">({w.length})</span>}
            </h2>
            {w.length === 0 ? (
              <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-600">Nothing waiting.</p>
            ) : (
              w.map((o) => (
                <div key={o.id as string} className="flex flex-col gap-2 border-t border-neutral-100 px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-col">
                      <Link href={`/admin/businesses/${bizId(o)}`} className="text-[14px] font-bold text-ink hover:underline">{name(o)}</Link>
                      <span className="text-[13px] text-neutral-600">
                        {o.kind === "top_up" ? "Balance top-up" : (o.description as string)} · asked {day(o.requested_at as string)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="num text-[15px] font-bold text-ink">{ghs(Number(o.amount))}</span>
                      <span className="font-mono text-[12.5px] text-neutral-600">{o.reference as string}</span>
                    </span>
                  </div>
                  <RecordPayment orderId={o.id as string} amount={ghs(Number(o.amount))} reference={o.reference as string} />
                </div>
              ))
            )}
          </Panel>

          <Panel className="px-5 py-4">
            <h2 className="font-heading text-base font-bold text-ink-heading">A transfer with no order</h2>
            <p className="mb-3 mt-1 text-[13px] text-neutral-600">Money that arrived without a reference from the app. It is added to the business&apos;s Balance.</p>
            <RecordTopUp businesses={((businesses.data ?? []) as Array<{ id: string; name: string }>)} />
          </Panel>

          <Panel>
            <h2 className="px-5 pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Recently recorded</h2>
            {r.length === 0 ? (
              <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-600">Nothing recorded yet.</p>
            ) : (
              r.map((o) => (
                <div key={o.id as string} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-neutral-100 px-5 py-2.5 text-[13px]">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-ink">{name(o)}</span>
                    <span className="text-neutral-600">
                      {o.kind === "top_up" ? "Balance top-up" : (o.description as string)} · {day(o.recorded_at as string)} · {PAID_WITH[o.paid_with as string] ?? ""} {o.payment_reference as string}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="num font-bold text-ink">{ghs(Number(o.amount))}</span>
                    <span className="font-mono text-[12px] text-neutral-500">{o.reference as string}</span>
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      )}
    </PageShell>
  );
}
