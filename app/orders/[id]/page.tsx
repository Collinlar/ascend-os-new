import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { StatusPill, Timeline, type Tone } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import OrderActions from "@/components/shop/OrderActions";
import RecordPayment from "@/components/payments/RecordPayment";
import OrderCustomerCare, { type OwnerReportView } from "@/components/shop/OrderCustomerCare";
import OrderRider from "@/components/shop/OrderRider";
import { orderRef, photoLinks } from "@/lib/shop/tracking";
import { ISSUE_BY_REASON } from "@/lib/shop/order-issues";
import { MODULES, shopTabs } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { currentWorkspace } from "@/lib/nav/workspace";
import { supabaseServer } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";

export const dynamic = "force-dynamic";

// One shop order (Modules M6a): what was ordered, how it is going, and
// where the money stands. An order is not paid until money is recorded
// against it, by the provider for a pay link or by the business on the day.

const ACCRA = "Africa/Accra";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const METHOD: Record<string, string> = { cash: "Cash", mobile_money: "Mobile Money", card: "Card", bank_transfer: "Bank transfer", payment_link: "Pay link" };
const STEP: Record<string, string> = {
  confirmed: "Confirmed",
  preparing: "Packing",
  ready: "Packed and ready",
  out_for_delivery: "Out for delivery",
  fulfilled: "Handed over",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
const STATUS: Record<string, { text: string; tone: Tone }> = {
  pending: { text: "Needs your confirmation", tone: "warn" },
  confirmed: { text: "Confirmed", tone: "teal" },
  preparing: { text: "Packing", tone: "info" },
  ready: { text: "Ready", tone: "ok" },
  out_for_delivery: { text: "Out for delivery", tone: "info" },
  fulfilled: { text: "Handed over", tone: "ok" },
  cancelled: { text: "Cancelled", tone: "mute" },
  refunded: { text: "Refunded", tone: "mute" },
};

export default async function OrderPage({ params }: { params: { id: string } }) {
  await checkPageAccess("/orders");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.orders}>
        <EmptyState title="Sign in to see this order." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const db = supabaseServer();
  const { data: o } = await db
    .from("shop_order")
    .select("id, status, fulfilment, total, subtotal, delivery_fee, placed_at, delivery_detail, customer_id, customer:customer_id(display_name, phone_e164), location:location_id(name), shop_order_line(description, quantity, unit_price, line_total)")
    .eq("id", params.id)
    .eq("business_id", workspace.businessId)
    .maybeSingle();
  if (!o) notFound();
  // Who delivers it (round 4, S1). undefined before 0150, when it cannot be kept.
  const rider = o
    ? await db.from("shop_order").select("rider_name, rider_phone").eq("id", params.id).maybeSingle().then((r) => (r.error ? undefined : ((r.data ?? null) as { rider_name: string | null; rider_phone: string | null } | null)), () => undefined)
    : undefined;

  const [pays, events, orders, reportRows] = await Promise.all([
    db
      .from("payment")
      .select("id, amount, method, status, verification, provider_reference, occurred_at, reversal_of")
      .eq("business_id", workspace.businessId)
      .eq("source_entity_type", "shop_order")
      .eq("source_entity_id", o.id)
      .order("occurred_at"),
    db.from("event_outbox").select("event_type, occurred_at, payload").eq("business_id", workspace.businessId).eq("entity_type", "shop_order").eq("entity_id", o.id).order("occurred_at"),
    o.customer_id
      ? db.from("shop_order").select("id", { count: "exact", head: true }).eq("business_id", workspace.businessId).eq("customer_id", o.customer_id as string)
      : Promise.resolve({ count: 0 }),
    // What the customer reported on this order (R5). Before 0145 the
    // columns are not there and the list is empty.
    db
      .from("customer_report")
      .select("id, reason, status, detail, photos, created_at, escalate_at, shop_reply")
      .eq("business_id", workspace.businessId)
      .eq("shop_order_id", o.id)
      .order("created_at"),
  ]);
  const reportViews: OwnerReportView[] = await Promise.all(
    ((reportRows.data ?? []) as Array<Record<string, unknown>>).map(async (r) => ({
      id: r.id as string,
      issue: ISSUE_BY_REASON[r.reason as string] ?? "A problem",
      status: r.status as string,
      detail: (r.detail as string) ?? null,
      photos: await photoLinks(((r.photos ?? []) as string[]).slice(0, 3)).catch(() => []),
      sentAt: when(r.created_at as string),
      escalateAt: r.escalate_at ? when(r.escalate_at as string) : null,
      shopReply: (r.shop_reply as string) ?? null,
    }))
  );

  const customer = o.customer as unknown as { display_name: string | null; phone_e164: string | null } | null;
  const name = customer?.display_name ?? "A customer";
  const first = name.split(/\s+/)[0];
  const lines = (o.shop_order_line ?? []) as unknown as Array<{ description: string; quantity: number; unit_price: number; line_total: number }>;
  const delivery = o.delivery_detail as { address?: string } | null;
  const payments = (pays.data ?? []).filter((p) => !p.reversal_of && p.status === "confirmed");
  const refunded = (pays.data ?? []).filter((p) => p.reversal_of && p.status === "refunded").reduce((n, p) => n + Number(p.amount), 0);
  const paid = payments.reduce((n, p) => n + Number(p.amount), 0) - refunded;
  const total = Number(o.total ?? 0);
  const left = Math.max(0, total - paid);
  const live = ["confirmed", "preparing", "ready", "out_for_delivery", "fulfilled"].includes(o.status as string);
  const st = STATUS[o.status as string] ?? { text: o.status as string, tone: "mute" as Tone };

  // The honest payment line (the design's "a payment request is not a payment").
  const money: { text: string; tone: Tone; detail: string } =
    ["cancelled", "refunded"].includes(o.status as string)
      ? { text: o.status === "refunded" ? "Refunded" : "Not owed", tone: "mute", detail: "Nothing is owed on a cancelled order." }
      : left <= 0.005
        ? { text: "Paid", tone: "ok", detail: "Paid in full, with a receipt for each payment." }
        : paid > 0.005
          ? { text: `Part paid, ${formatGHS(left)} left`, tone: "info", detail: `${formatGHS(paid)} received so far.` }
          : o.status === "fulfilled"
            ? { text: "Handed over, not paid", tone: "bad", detail: `It went to ${first}, but no money is recorded against it. Record what they paid, so it stops showing as owed.` }
            : { text: "Pay on the day", tone: "warn", detail: `${first} pays at ${o.fulfilment === "pickup" ? "pickup" : "delivery"}. The order stays unpaid until you record the money.` };

  const flow = [
    { id: "placed", at: o.placed_at as string, title: "Ordered on your shop", detail: when(o.placed_at as string), tone: "teal" as Tone },
    ...(events.data ?? [])
      .map((e) => {
        const to = (e.payload as Record<string, unknown> | null)?.to as string | undefined;
        return to && STEP[to]
          ? { id: `${e.event_type}:${e.occurred_at}`, at: e.occurred_at as string, title: STEP[to], detail: when(e.occurred_at as string), tone: (to === "cancelled" || to === "refunded" ? "bad" : to === "fulfilled" ? "ok" : "teal") as Tone }
          : null;
      })
      .filter((x): x is { id: string; at: string; title: string; detail: string; tone: Tone } => x !== null),
    ...payments.map((p) => ({
      id: `pay:${p.id}`,
      at: p.occurred_at as string,
      title: `${formatGHS(Number(p.amount))} paid by ${METHOD[p.method as string] ?? p.method}`,
      detail: `${when(p.occurred_at as string)}, ${p.verification === "provider_confirmed" ? "confirmed by the provider" : "recorded by the business"}`,
      tone: "ok" as Tone,
    })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  return (
    <ModulePage identity={MODULES.orders} title={`Order ${String(o.id).slice(0, 8).toUpperCase()}`} tabs={shopTabs(workspace.capabilities, "/orders")}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Link href="/orders" className={`${secondaryAction} min-h-[40px] self-start`}>
            <Icon name="back" size={15} />
            All orders
          </Link>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-teal-700">Order {String(o.id).slice(0, 8).toUpperCase()}</span>
                <strong className="font-heading text-[18px] text-ink-heading">
                  {name} · {formatGHS(total)}
                </strong>
                <span className="text-xs text-neutral-600">
                  {o.fulfilment === "pickup"
                    ? `Picking up${(o.location as unknown as { name: string } | null)?.name ? ` at ${(o.location as unknown as { name: string }).name}` : ""}`
                    : `Delivery to ${delivery?.address ?? "an address they did not give"}`}
                </span>
              </span>
              <StatusPill tone={st.tone}>{st.text}</StatusPill>
            </div>
            <p className={`flex gap-2 rounded-panel px-3 py-2.5 text-[13px] ${money.tone === "bad" ? "bg-danger-tint text-danger-ink" : money.tone === "ok" ? "bg-success-tint text-success-ink" : "bg-gold-100 text-gold-700"}`}>
              <span className="mt-px flex-none">
                <Icon name={money.tone === "ok" ? "check" : "money"} size={16} />
              </span>
              {money.detail}
            </p>
            <div className="flex flex-col text-[13.5px]">
              {lines.map((l, i) => (
                <span key={i} className="flex justify-between gap-3 border-b border-neutral-100 py-2">
                  <span className="text-ink">
                    {l.description} × {Number(l.quantity)}
                  </span>
                  <span className="num text-ink">{formatGHS(Number(l.line_total))}</span>
                </span>
              ))}
              {Number(o.delivery_fee ?? 0) > 0 && (
                <span className="flex justify-between gap-3 border-b border-neutral-100 py-2">
                  <span className="text-ink">Delivery</span>
                  <span className="num text-ink">{formatGHS(Number(o.delivery_fee))}</span>
                </span>
              )}
              <span className="flex justify-between gap-3 pt-2 font-heading text-[16px] font-extrabold">
                <span>Total</span>
                <span className="num">{formatGHS(total)}</span>
              </span>
            </div>
          </Card>
          <Card title="How it is going">
            <Timeline entries={flow} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Money" aside={<StatusPill tone={money.tone}>{money.text}</StatusPill>}>
            <span className="flex justify-between text-[13px]">
              <span className="text-neutral-600">Received</span>
              <strong className="num text-ink">{formatGHS(paid)}</strong>
            </span>
            <span className="flex justify-between text-[13px]">
              <span className="text-neutral-600">Still to pay</span>
              <strong className="num text-ink">{formatGHS(left)}</strong>
            </span>
            {live && left > 0.005 && <RecordPayment source="shop_order" sourceId={o.id as string} left={left} customerFirst={first} />}
          </Card>
          <OrderCustomerCare
            orderId={o.id as string}
            orderRef={orderRef(o.id as string)}
            customerFirst={first}
            customerPhone={customer?.phone_e164 ?? null}
            reports={reportViews}
          />
          {o.fulfilment === "merchant_delivery" && rider !== undefined && !["fulfilled", "cancelled", "refunded"].includes(o.status as string) && (
            <Card title="Who delivers it">
              <OrderRider orderId={o.id as string} name={rider?.rider_name ?? null} phone={rider?.rider_phone ?? null} />
            </Card>
          )}
          <Card title="Move it on">
            <OrderActions orderId={o.id as string} status={o.status as string} fulfilment={o.fulfilment as string} />
            {!["pending", "confirmed", "preparing", "ready", "out_for_delivery"].includes(o.status as string) && (
              <span className="text-[13px] text-neutral-600">This order is finished.</span>
            )}
          </Card>
          <Card title={first}>
            <span className="text-[13px] text-neutral-600">
              {(orders as { count: number | null }).count && (orders as { count: number | null }).count! > 1
                ? `Has ordered ${(orders as { count: number | null }).count} times from your shop.`
                : "Their first order from your shop."}
            </span>
            <span className="flex flex-wrap gap-2">
              {customer?.phone_e164 && (
                <a href={`https://wa.me/${customer.phone_e164.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[40px]`}>
                  <Icon name="send" size={15} />
                  WhatsApp {first}
                </a>
              )}
              {o.customer_id && (
                <Link href={`/customers/${o.customer_id}`} className={`${secondaryAction} min-h-[40px]`}>
                  See {first} in Customers
                </Link>
              )}
            </span>
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}

function Card({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="font-heading text-base font-bold text-ink-heading">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
