import type { Metadata, Viewport } from "next";
import { supabaseServer } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";
import { lookUpOrderLink, orderRef, photoLinks } from "@/lib/shop/tracking";
import { SETTINGS_COLUMNS, settingsFromRow, fulfilmentFacts } from "@/lib/shop/settings";
import { ISSUE_BY_REASON } from "@/lib/shop/order-issues";
import OrderHelp, { type OrderReportView } from "@/components/shop/OrderHelp";

export const dynamic = "force-dynamic";

// A customer's own page for their order (round 2, R5): where it is, what is
// on it and what was paid, the receipt, and where to say if something is
// wrong. Reached only through the private link they were given.

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

const ACCRA = "Africa/Accra";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function OrderTrackingPage({ params }: { params: { token: string } }) {
  const link = await lookUpOrderLink(params.token);
  if (link.state !== "ready") {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="text-xl font-extrabold text-ink">{link.state === "unreachable" ? "We could not open your order just now" : "This order link has expired"}</h1>
          <p className="mt-2 text-[14px] font-medium text-ink-muted">
            {link.state === "unreachable" ? "Check your connection and refresh the page." : "Ask the shop to send you a new link on WhatsApp."}
          </p>
        </div>
      </Shell>
    );
  }

  const db = supabaseServer();
  const [{ data: o }, biz, settingsRow, look, events, pays, reports] = await Promise.all([
    db
      .from("shop_order")
      .select("id, status, fulfilment, subtotal, delivery_fee, total, placed_at, delivery_detail, location:location_id(name, address, city), shop_order_line(description, quantity, unit_price, line_total)")
      .eq("id", link.orderId)
      .maybeSingle(),
    db.from("business").select("name, shop_slug").eq("id", link.businessId).maybeSingle(),
    db.from("shop_settings").select(SETTINGS_COLUMNS).eq("business_id", link.businessId).maybeSingle(),
    db.from("document_branding").select("phone").eq("business_id", link.businessId).maybeSingle(),
    db.from("event_outbox").select("occurred_at, payload").eq("entity_type", "shop_order").eq("entity_id", link.orderId).order("occurred_at"),
    db.from("payment").select("id, amount, method, status, reversal_of, occurred_at").eq("business_id", link.businessId).eq("source_entity_type", "shop_order").eq("source_entity_id", link.orderId),
    db
      .from("customer_report")
      .select("id, reason, status, detail, photos, created_at, escalate_at, shop_reply, shop_replied_at, shop_resolved_at")
      .eq("shop_order_id", link.orderId)
      .order("created_at"),
  ]);
  if (!o) {
    return (
      <Shell>
        <p className="py-16 text-center font-semibold text-ink-muted">We could not find this order.</p>
      </Shell>
    );
  }

  const businessName = (biz.data?.name as string) ?? "The shop";
  const settings = settingsFromRow((settingsRow.data ?? null) as Record<string, unknown> | null);
  const place = o.location as unknown as { name: string; address: string | null; city: string | null } | null;
  const detail = (o.delivery_detail ?? {}) as { address?: string; area?: string; gps?: string };
  const pickup = o.fulfilment === "pickup";
  const lines = (o.shop_order_line ?? []) as unknown as Array<{ description: string; quantity: number; unit_price: number; line_total: number }>;
  const at = new Map<string, string>();
  for (const e of events.data ?? []) {
    const to = (e.payload as Record<string, unknown> | null)?.to as string | undefined;
    if (to && !at.has(to)) at.set(to, e.occurred_at as string);
  }
  const confirmed = (pays.data ?? []).filter((p) => p.status === "confirmed" && !p.reversal_of);
  const refunded = (pays.data ?? []).filter((p) => p.reversal_of && p.status === "refunded").reduce((n, p) => n + Number(p.amount), 0);
  const paid = confirmed.reduce((n, p) => n + Number(p.amount), 0) - refunded;
  const total = Number(o.total ?? 0);
  const left = Math.max(0, total - paid);

  const { data: receipts } = confirmed.length
    ? await db.from("document").select("id, number, payment_id").eq("type", "receipt").not("number", "is", null).in("payment_id", confirmed.map((p) => p.id as string))
    : { data: [] as Array<{ id: string; number: string; payment_id: string }> };

  // The steps, in the design's order.
  const order = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "fulfilled"];
  const reached = order.indexOf(o.status as string);
  const stopped = o.status === "cancelled" || o.status === "refunded";
  const steps = [
    { key: "pending", title: "Order placed", at: o.placed_at as string },
    { key: "confirmed", title: `Confirmed by ${businessName}` },
    { key: "preparing", title: "Packing" },
    pickup ? { key: "ready", title: "Ready for pickup" } : { key: "out_for_delivery", title: "Out for delivery" },
    { key: "fulfilled", title: pickup ? "Collected" : "Delivered" },
  ].map((s) => {
    const idx = order.indexOf(s.key);
    const done = !stopped && (reached >= idx || (s.key === "ready" && reached >= order.indexOf("ready")));
    return { ...s, done, when: s.at ?? at.get(s.key) ?? null };
  });
  const current = [...steps].reverse().find((s) => s.done);
  const facts = fulfilmentFacts(settings, []);
  const head = stopped
    ? o.status === "refunded" ? "Refunded" : "Cancelled"
    : o.status === "fulfilled"
      ? pickup ? "Collected. Thank you." : "Delivered. Thank you."
      : o.status === "ready" && pickup
        ? "Ready for pickup"
        : o.status === "out_for_delivery"
          ? "On its way to you"
          : o.status === "pending"
            ? `Waiting for ${businessName} to confirm`
            : current?.title ?? "In progress";
  const sub = stopped
    ? "Nothing more will happen on this order. Ask the shop on WhatsApp if that is not what you expected."
    : o.status === "ready" && pickup
      ? `Show order ${orderRef(o.id as string)} at the counter${place ? `, ${place.name}` : ""}.`
      : o.status === "out_for_delivery"
        ? `To ${[detail.address, detail.area].filter(Boolean).join(", ") || "your address"}.`
        : o.status === "pending"
          ? "They confirm on WhatsApp. Nothing is paid until you have it."
          : pickup
            ? facts.pickup?.detail ?? "They tell you when to come."
            : facts.delivery?.detail ?? "They tell you when it leaves.";

  const shopPhone = ((look.data?.phone as string) ?? "").replace(/[^\d+]/g, "");
  const wa = shopPhone.length >= 9 ? `https://wa.me/${shopPhone.replace(/^0/, "233").replace(/^\+/, "")}?text=${encodeURIComponent(`Hello, about my order ${orderRef(o.id as string)}.`)}` : null;

  const reportViews: OrderReportView[] = await Promise.all(
    ((reports.data ?? []) as Array<Record<string, unknown>>).map(async (r) => ({
      id: r.id as string,
      issue: ISSUE_BY_REASON[r.reason as string] ?? "A problem",
      status: r.status as string,
      detail: (r.detail as string) ?? null,
      photos: await photoLinks(((r.photos ?? []) as string[]).slice(0, 3)),
      sentAt: when(r.created_at as string),
      escalateAt: r.escalate_at ? when(r.escalate_at as string) : null,
      shopReply: (r.shop_reply as string) ?? null,
    }))
  );

  return (
    <Shell>
      <p className="mono text-[12.5px] text-slate-grey">Order {orderRef(o.id as string)} · {businessName}</p>
      <div className="mt-3 rounded-panel bg-teal-light px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-dark">
          {pickup ? `Pickup${place ? ` · ${place.name}` : ""}` : `Delivery${detail.area ? ` · ${detail.area}` : ""}`}
        </p>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{head}</h1>
        <p className="mt-1 text-[14px] font-medium text-ink-muted">{sub}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {!stopped && (
            <ol className="rounded-panel border border-line bg-white p-4">
              {steps.map((s, i) => (
                <li key={s.key} className="flex gap-3.5">
                  <div className="flex flex-none flex-col items-center">
                    <span className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full ${s.done ? "bg-teal" : "border-2 border-line-stronger bg-white"}`}>
                      {s.done && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <polyline points="5,12.5 10,17.5 19,7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {i < steps.length - 1 && <span className={`w-px flex-1 ${s.done ? "bg-teal" : "bg-line"}`} />}
                  </div>
                  <div className={i < steps.length - 1 ? "pb-4" : ""}>
                    <p className={`text-[14px] font-bold ${s.done ? "text-ink" : "text-ink-muted"}`}>{s.title}</p>
                    <p className="mt-0.5 text-[12px] font-medium text-slate-grey">{s.when ? when(s.when) : s.done ? "Done" : "Next"}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <section className="rounded-panel border border-line bg-white p-4">
            <h2 className="text-[15px] font-extrabold text-ink">What you ordered</h2>
            <div className="mt-3 flex flex-col gap-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="min-w-0 text-ink">
                    {l.description} <span className="text-ink-muted">× {Number(l.quantity)}</span>
                  </span>
                  <span className="num flex-none font-semibold text-ink">{formatGHS(Number(l.line_total))}</span>
                </div>
              ))}
              {Number(o.delivery_fee ?? 0) > 0 && (
                <div className="flex justify-between text-[14px]">
                  <span className="text-ink-muted">Delivery{detail.area ? ` to ${detail.area}` : ""}</span>
                  <span className="num font-semibold text-ink">{formatGHS(Number(o.delivery_fee))}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-2.5 text-[15px] font-extrabold text-ink">
                <span>Total</span>
                <span className="num">{formatGHS(total)}</span>
              </div>
              <div className="flex justify-between text-[13.5px]">
                <span className="text-ink-muted">Paid</span>
                <span className="num font-semibold text-ink">{paid > 0.005 ? formatGHS(paid) : "Nothing yet, you pay on the day"}</span>
              </div>
              {paid > 0.005 && left > 0.005 && (
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-ink-muted">Left to pay</span>
                  <span className="num font-semibold text-ink">{formatGHS(left)}</span>
                </div>
              )}
            </div>
            {(receipts ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(receipts ?? []).map((r) => (
                  <a
                    key={r.id as string}
                    href={`/api/order-link/receipt?token=${encodeURIComponent(params.token)}&doc=${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap inline-flex min-h-[44px] items-center rounded-control border border-line px-4 text-[13.5px] font-bold text-teal-dark"
                  >
                    Receipt {r.number as string}
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {(wa || settings.contactLine) && (
            <div className="rounded-panel border border-line bg-white p-4">
              <p className="text-[14px] font-bold text-ink">Questions about your order?</p>
              {settings.contactLine && <p className="mt-1 text-[13px] font-medium text-ink-muted">{settings.contactLine}</p>}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="tap mt-3 inline-flex min-h-[44px] items-center rounded-control bg-teal px-4 text-[13.5px] font-bold text-white">
                  WhatsApp {businessName}
                </a>
              )}
            </div>
          )}
          <OrderHelp token={params.token} businessName={businessName} reports={reportViews} returnsLine={settings.saved ? fulfilmentFacts(settings, []).returns : null} />
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1000px] px-5 pb-16 pt-6 sm:px-8">{children}</div>
      <footer className="border-t border-neutral-100 px-5 py-6 text-center text-[12.5px] font-semibold text-slate-grey">Powered by Ascend Shop</footer>
    </main>
  );
}
