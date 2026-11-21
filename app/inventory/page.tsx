import Link from "next/link";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { checkPageAccess } from "@/lib/authority/page";
import { EmptyState, FigureRow, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import AdjustStock from "@/components/inventory/AdjustStock";
import ReceiveStock from "@/components/inventory/ReceiveStock";
import { supabaseServer } from "@/lib/supabase";
import StockRule from "@/components/inventory/StockRule";
import { isBelowZero, isLow, isOut, KIND_LABEL, recentMovements, stockLevels, type Movement, type StockLine } from "@/lib/domains/inventory";

export const dynamic = "force-dynamic";

// Inventory (Inventory Core plan, decision 10; v3 Business Web "Inventory").
// Stock by place, on hand, held for shop orders and available, and the
// movement history that explains every figure. Adjust stock is the one
// action. Transfers and suppliers come with Advanced Inventory and are not
// shown here until it exists.

type Show = "all" | "low" | "out";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function qty(n: number) {
  return Number.isInteger(n) ? n.toLocaleString("en-GH") : n.toLocaleString("en-GH", { maximumFractionDigits: 3 });
}

function Status({ line }: { line: StockLine }) {
  if (isBelowZero(line)) return <span className="rounded-full bg-danger-tint px-2.5 py-0.5 text-[12px] font-bold text-danger-ink">Below zero</span>;
  if (isOut(line)) return <span className="rounded-full bg-danger-tint px-2.5 py-0.5 text-[12px] font-bold text-danger-ink">Out</span>;
  if (isLow(line)) return <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-[12px] font-bold text-gold-700">Low</span>;
  return null;
}

export default async function Inventory({ searchParams }: { searchParams: { tab?: string; show?: string; item?: string } }) {
  await checkPageAccess("/inventory");

  const personId = await currentPersonId();
  if (!personId) {
    return (
      <PageShell>
        <PageHeader title="Inventory" />
        <EmptyState title="Sign in to see your stock." detail="We send a code to the WhatsApp number your business is set up with." />
      </PageShell>
    );
  }
  const membership = await activeMembership<{ business_id: string; role: { key: string } | null }>(personId, "business_id, role:role_id(key)");
  if (!membership) {
    return (
      <PageShell>
        <PageHeader title="Inventory" />
        <EmptyState title="Set up your business first." detail="Your stock lives here once it exists." />
      </PageShell>
    );
  }
  const businessId = membership.business_id;
  const canAdjust = ["owner", "manager"].includes(membership.role?.key ?? "");
  const tab = searchParams.tab === "moves" ? "moves" : "stock";
  const show: Show = searchParams.show === "low" || searchParams.show === "out" ? searchParams.show : "all";
  const itemFilter = /^[0-9a-f-]{36}$/i.test(searchParams.item ?? "") ? searchParams.item : undefined;

  let data: { places: { id: string; name: string }[]; lines: StockLine[] };
  let moves: Movement[] = [];
  try {
    data = await stockLevels(businessId);
    if (tab === "moves") moves = await recentMovements(businessId, { itemId: itemFilter, limit: 150 });
  } catch {
    return (
      <PageShell>
        <PageHeader title="Inventory" />
        <EmptyState title="We could not load your stock just now." detail="Refresh in a moment. Nothing has changed on your shelf." />
      </PageShell>
    );
  }

  const { places, lines } = data;
  // Average cost arrives with 0125; until then the page simply has none.
  const costs = new Map<string, number>();
  if (canAdjust) {
    const { data: rows } = await supabaseServer().from("catalogue_item").select("id, average_cost").eq("business_id", businessId).not("average_cost", "is", null);
    for (const r of (rows ?? []) as { id: string; average_cost: number | string }[]) costs.set(r.id, Number(r.average_cost));
  }
  const tracked = lines.filter((l) => l.tracked);
  const untracked = lines.length - tracked.length;
  const low = tracked.filter(isLow);
  const out = tracked.filter(isOut);
  const held = tracked.reduce((n, l) => n + l.held, 0);
  const belowZero = tracked.filter(isBelowZero);
  // Out at one place while another still has some: worth a move, not a reorder.
  const outSomewhere = places.length > 1 ? tracked.filter((l) => !isOut(l) && l.at.some((a) => a.available <= 0)).length : 0;
  const shown = show === "low" ? low : show === "out" ? out : tracked;
  const multi = places.length > 1;
  const filteredItem = itemFilter ? lines.find((l) => l.itemId === itemFilter) : undefined;

  const link = (p: { tab?: string; show?: Show; item?: string }) => {
    const q = new URLSearchParams();
    if (p.tab && p.tab !== "stock") q.set("tab", p.tab);
    if (p.show && p.show !== "all") q.set("show", p.show);
    if (p.item) q.set("item", p.item);
    const s = q.toString();
    return s ? `/inventory?${s}` : "/inventory";
  };

  const adjustItems = lines.map((l) => ({
    id: l.itemId,
    name: l.name,
    onHand: Object.fromEntries(places.map((p, i) => [p.id, l.at[i]?.onHand ?? 0])),
  }));

  return (
    <PageShell>
      <PageHeader
        title="Inventory"
        intro={multi ? `Stock across your ${places.length} places, and every change that made it.` : "What is on your shelf, and every change that made it."}
        action={
          canAdjust && lines.length > 0 ? (
            <>
              <AdjustStock businessId={businessId} places={places} items={adjustItems} startWith={itemFilter} />
              <ReceiveStock businessId={businessId} places={places} items={lines.map((l) => ({ id: l.itemId, name: l.name, averageCost: costs.get(l.itemId) ?? null }))} />
            </>
          ) : null
        }
      />

      {lines.length === 0 ? (
        <EmptyState
          title="Add your products first."
          detail="Stock is counted against the products you sell."
          action={
            <Link href="/products/add" className="tap inline-flex min-h-[44px] items-center rounded-control bg-teal px-4 text-[14px] font-bold text-white">
              Add my products
            </Link>
          }
        />
      ) : (
        <>
          <FigureRow
            figures={[
              { label: "Counted products", value: qty(tracked.length), sub: untracked ? `${untracked} not counted` : "All your products" },
              { label: "Low", value: qty(low.length), sub: "At or under their low mark", tone: low.length ? "warn" : undefined },
              { label: "Out", value: qty(out.length), sub: outSomewhere ? `${outSomewhere} more out at one place` : "Nothing left to sell", tone: out.length ? "bad" : undefined },
              { label: "Held for shop orders", value: qty(held), sub: "Set aside, not yet collected" },
            ]}
          />

          {belowZero.length > 0 && (
            <div role="status" className="mb-4 rounded-[18px] border border-danger/30 bg-danger-tint px-5 py-3.5 text-[13.5px] text-danger-ink">
              <p className="font-bold">
                {belowZero.length === 1 ? `${belowZero[0].name} has` : `${belowZero.length} products have`} sold more than Ascend had on record.
              </p>
              <p className="mt-0.5">
                A till sold them offline, or goods came in that were never received here. Count the shelf with Adjust stock so the figure is true again.
              </p>
            </div>
          )}

          <div role="tablist" aria-label="Inventory views" className="mb-4 flex gap-1 border-b border-line-brand">
            {[
              ["stock", multi ? "Stock by place" : "Stock"],
              ["moves", "Movements"],
            ].map(([k, label]) => (
              <Link
                key={k}
                role="tab"
                aria-selected={tab === k}
                href={link({ tab: k })}
                className={`tap -mb-px flex min-h-[44px] items-center border-b-2 px-3 text-[14px] font-semibold ${
                  tab === k ? "border-teal text-teal-800" : "border-transparent text-neutral-600 hover:text-ink"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {tab === "stock" && (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["all", `All ${tracked.length}`],
                    ["low", `Low ${low.length}`],
                    ["out", `Out ${out.length}`],
                  ] as [Show, string][]
                ).map(([k, label]) => (
                  <Link
                    key={k}
                    href={link({ show: k })}
                    aria-current={show === k ? "page" : undefined}
                    className={`tap flex min-h-[40px] items-center rounded-chip px-3.5 text-[13px] font-semibold ${
                      show === k ? "bg-teal-50 text-teal-800 ring-1 ring-teal" : "border border-line-brand bg-white text-neutral-700"
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>

              {tracked.length === 0 ? (
                <EmptyState
                  title="You are not counting any products yet."
                  detail="Tap Receive stock when goods come in. From then on every sale takes from the count."
                />
              ) : shown.length === 0 ? (
                <EmptyState title={show === "out" ? "Nothing is out of stock." : "Nothing is running low."} detail="Good. This list fills as stock runs down." />
              ) : (
                <Panel>
                  <div
                    aria-hidden
                    className="hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 lg:grid lg:items-center lg:gap-4"
                    style={{ gridTemplateColumns: `minmax(0,1fr) ${multi ? places.map(() => "120px").join(" ") : "90px 90px"} 110px 70px` }}
                  >
                    <span>Product</span>
                    {multi ? places.map((p) => <span key={p.id} className="truncate text-right">{p.name}</span>) : (
                      <>
                        <span className="text-right">On hand</span>
                        <span className="text-right">Held</span>
                      </>
                    )}
                    <span className="text-right">Available</span>
                    <span />
                  </div>
                  {shown.map((l, i) => (
                    <Link
                      key={l.itemId}
                      href={link({ tab: "moves", item: l.itemId })}
                      className={`flex flex-col gap-1 px-5 py-3 hover:bg-neutral-50 lg:grid lg:items-center lg:gap-4 ${i > 0 ? "border-t border-neutral-100" : ""}`}
                      style={{ gridTemplateColumns: `minmax(0,1fr) ${multi ? places.map(() => "120px").join(" ") : "90px 90px"} 110px 70px` }}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-ink">{l.name}</span>
                          <span className="block text-[12px] text-neutral-600">
                            {l.lastMovedAt ? `Last change ${when(l.lastMovedAt)}` : "No changes yet"}
                            {l.lowAt !== null ? ` · low at ${qty(l.lowAt)}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-none items-center gap-2 lg:hidden">
                          <span className="num font-heading text-[18px] font-extrabold text-ink-heading">{qty(l.available)}</span>
                          <Status line={l} />
                        </span>
                      </span>
                      {multi ? (
                        places.map((p, j) => (
                          <span key={p.id} className="num flex justify-between text-[13px] text-neutral-700 lg:block lg:text-right">
                            <span className="lg:hidden">{p.name}</span>
                            <span className={l.at[j].available <= 0 ? "font-semibold text-danger-ink" : undefined}>
                              {l.at[j].available <= 0 ? `${qty(l.at[j].available)}, out` : qty(l.at[j].available)}
                              {l.at[j].held > 0 && <span className="font-normal text-neutral-600"> ({qty(l.at[j].held)} held)</span>}
                            </span>
                          </span>
                        ))
                      ) : (
                        <>
                          <span className="num text-[13px] text-neutral-700 lg:text-right">
                            <span className="lg:hidden">On hand </span>
                            {qty(l.onHand)}
                            {l.held > 0 && <span className="lg:hidden">, {qty(l.held)} held for shop orders</span>}
                          </span>
                          <span className="num hidden text-[13px] text-neutral-700 lg:block lg:text-right">{qty(l.held)}</span>
                        </>
                      )}
                      <span className="num hidden text-right font-heading text-[16px] font-extrabold text-ink-heading lg:block">{qty(l.available)}</span>
                      <span className="hidden justify-end lg:flex">
                        <Status line={l} />
                      </span>
                    </Link>
                  ))}
                </Panel>
              )}
              {untracked > 0 && tracked.length > 0 && (
                <p className="mt-3 text-[12.5px] text-neutral-600">
                  {untracked} {untracked === 1 ? "product is" : "products are"} not counted. Receive stock for one and it is counted from then on.
                </p>
              )}
            </>
          )}

          {tab === "moves" && (
            <>
              {filteredItem && canAdjust && filteredItem.tracked && (
                <StockRule key={filteredItem.itemId} businessId={businessId} itemId={filteredItem.itemId} rule={filteredItem.rule} />
              )}
              {filteredItem && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px] text-neutral-700">
                  <span>
                    Showing <strong className="text-ink">{filteredItem.name}</strong>, {qty(filteredItem.available)} available
                  </span>
                  <Link href={link({ tab: "moves" })} className="tap flex min-h-[40px] items-center px-2 font-semibold text-teal-800">
                    Show every product
                  </Link>
                </div>
              )}
              {moves.length === 0 ? (
                <EmptyState title="No stock changes yet." detail="Sales, deliveries, write-offs and counts appear here as they happen." />
              ) : (
                <Panel>
                  {moves.map((m, i) => (
                    <div key={m.id} className={`flex items-start justify-between gap-4 px-5 py-3 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-ink">
                          {filteredItem ? KIND_LABEL[m.kind] ?? m.kind : m.item}
                        </span>
                        <span className="block text-[12.5px] text-neutral-600">
                          {[
                            filteredItem ? null : KIND_LABEL[m.kind] ?? m.kind,
                            when(m.at),
                            multi ? m.place : null,
                            m.who ? `by ${m.who}` : null,
                            m.till,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {m.reason && <span className="block text-[12.5px] text-neutral-700">&ldquo;{m.reason}&rdquo;</span>}
                      </span>
                      <span className={`num flex-none font-heading text-[16px] font-extrabold ${m.quantity < 0 ? "text-ink-heading" : "text-teal-800"}`}>
                        {m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : ""}
                        {qty(Math.abs(m.quantity))}
                      </span>
                    </div>
                  ))}
                </Panel>
              )}
              {moves.length === 150 && <p className="mt-3 text-[12.5px] text-neutral-600">The latest 150. Pick a product to see its whole history.</p>}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
