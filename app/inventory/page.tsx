import Link from "next/link";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { checkPageAccess } from "@/lib/authority/page";
import { EmptyState, FigureRow, PageHeader, PageShell, Panel, secondaryAction } from "@/components/shell/Page";
import AdjustStock from "@/components/inventory/AdjustStock";
import ReceiveStock from "@/components/inventory/ReceiveStock";
import { supabaseServer } from "@/lib/supabase";
import StockRule from "@/components/inventory/StockRule";
import CountDecision from "@/components/inventory/CountDecision";
import { formatGHS } from "@/lib/money";
import SendTransfer from "@/components/inventory/SendTransfer";
import TransferCancel from "@/components/inventory/TransferCancel";
import { effectiveAccess } from "@/lib/domains/entitlements";
import PlaceOrder from "@/components/inventory/PlaceOrder";
import SupplierForm from "@/components/inventory/SupplierForm";
import OrderClose from "@/components/inventory/OrderClose";
import PayDelivery from "@/components/inventory/PayDelivery";
import ReorderRule from "@/components/inventory/ReorderRule";
import PlaceLowMarks from "@/components/inventory/PlaceLowMarks";
import ExpirySwitch from "@/components/inventory/ExpirySwitch";
import WriteOffExpired from "@/components/inventory/WriteOffExpired";
import { orderMessage, whatsappLink } from "@/lib/inventory/order-message";
import { isBelowZero, isLow, isOut, KIND_LABEL, stockCounts, stockOrders, stockTransfers, suppliers as loadSuppliers, reorderGroups, expiryRows, expirySummary, stockValue, productMargins, type ExpiryRow, type ExpirySummary, type PlaceValue, type ProductMargin, type ReorderGroup, type StockCountView, type StockOrderView, type StockTransferView, type SupplierView, recentMovements, stockLevels, type Movement, type StockLine } from "@/lib/domains/inventory";

export const dynamic = "force-dynamic";

// Inventory (Inventory Core plan, decision 10; v3 Business Web "Inventory").
// Stock by place, on hand, held for shop orders and available, and the
// movement history that explains every figure. Moving stock between places
// comes with Advanced Inventory (0131): a business without it sees no
// Transfers tab and no locked teaser (decision 10).

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
  const membership = await activeMembership<{ id: string; business_id: string; role: { key: string } | null }>(personId, "id, business_id, role:role_id(key)");
  if (!membership) {
    return (
      <PageShell>
        <PageHeader title="Inventory" />
        <EmptyState title="Set up your business first." detail="Your stock lives here once it exists." />
      </PageShell>
    );
  }
  const businessId = membership.business_id;
  const membershipId = membership.id;
  const canAdjust = ["owner", "manager"].includes(membership.role?.key ?? "");
  const asked = searchParams.tab;
  let tab = asked === "moves" || asked === "counts" || asked === "transfers" || asked === "orders" || asked === "suppliers" || asked === "expiry" || asked === "value" ? asked : "stock";
  const show: Show = searchParams.show === "low" || searchParams.show === "out" ? searchParams.show : "all";
  const itemFilter = /^[0-9a-f-]{36}$/i.test(searchParams.item ?? "") ? searchParams.item : undefined;

  let data: { places: { id: string; name: string }[]; lines: StockLine[] };
  let moves: Movement[] = [];
  let counts: StockCountView[] = [];
  let transfers: StockTransferView[] = [];
  let orders: StockOrderView[] = [];
  let supplierList: SupplierView[] = [];
  let reorder: ReorderGroup[] = [];
  // Each place's own low mark for a product (0135), "place|item".
  const placeMarks = new Map<string, number>();
  const caps = await effectiveAccess(businessId)
    .then((a) => a.capabilities)
    .catch(() => new Set<string>());
  const canMove = caps.has("inventory.transfers");
  const canBuy = caps.has("inventory.purchasing");
  const canExpiry = caps.has("inventory.expiry");
  const canValue = caps.has("inventory.valuation");
  let values: PlaceValue[] = [];
  let margins: ProductMargin[] = [];
  // The last 30 days, Accra time, for margins (0138).
  const valueTo = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const valueFrom = new Date(Date.now() - 29 * 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  let expiry: ExpiryRow[] = [];
  let expirySum: ExpirySummary | null = null;
  // Products that keep expiry dates (0137), so Receive stock asks for them.
  const expiring = new Set<string>();
  if (tab === "transfers" && !canMove) tab = "stock";
  if ((tab === "orders" || tab === "suppliers") && !canBuy) tab = "stock";
  if (tab === "expiry" && !canExpiry) tab = "stock";
  if (tab === "value" && !canValue) tab = "stock";
  try {
    data = await stockLevels(businessId);
    counts = await stockCounts(businessId);
    if (canMove) transfers = await stockTransfers(businessId);
    if (canBuy) [orders, supplierList, reorder] = await Promise.all([stockOrders(businessId), loadSuppliers(businessId), reorderGroups(businessId)]);
    if (canBuy) {
      const { data: pm } = await supabaseServer().from("place_low_mark").select("location_id, item_id, low_at").eq("business_id", businessId);
      for (const m of pm ?? []) placeMarks.set(`${m.location_id}|${m.item_id}`, Number(m.low_at));
    }
    if (canValue && tab === "value") [values, margins] = await Promise.all([stockValue(businessId), productMargins(businessId, valueFrom, valueTo)]);
    if (canExpiry) {
      [expiry, expirySum] = await Promise.all([expiryRows(businessId, 30), expirySummary(businessId)]);
      const { data: ex } = await supabaseServer().from("catalogue_item").select("id").eq("business_id", businessId).eq("tracks_expiry", true);
      for (const r of ex ?? []) expiring.add(r.id as string);
    }
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
  const businessName = canBuy
    ? (((await supabaseServer().from("business").select("name").eq("id", businessId).maybeSingle()).data?.name as string | undefined) ?? "")
    : "";
  const costs = new Map<string, number>();
  if (canAdjust) {
    const { data: rows } = await supabaseServer().from("catalogue_item").select("id, average_cost").eq("business_id", businessId).not("average_cost", "is", null);
    for (const r of (rows ?? []) as { id: string; average_cost: number | string }[]) costs.set(r.id, Number(r.average_cost));
  }
  const tracked = lines.filter((l) => l.tracked);
  const untracked = lines.length - tracked.length;
  // With two or more places a product is low when it is low at any one of
  // them, against that place's own mark (0135) or else the product's. One
  // place: as before.
  const lowAt = (placeId: string, l: StockLine) => placeMarks.get(`${placeId}|${l.itemId}`) ?? l.lowAt;
  const lowSomewhere = (l: StockLine) =>
    places.length > 1
      ? l.tracked && places.some((p, j) => { const m = lowAt(p.id, l); return m !== null && l.at[j].available > 0 && l.at[j].available <= m; })
      : isLow(l);
  const low = tracked.filter(lowSomewhere);
  const out = tracked.filter(isOut);
  const held = tracked.reduce((n, l) => n + l.held, 0);
  const belowZero = tracked.filter(isBelowZero);
  const waiting = counts.filter((c) => c.status === "waiting");
  const onTheWay = transfers.filter((t) => t.status === "sent");
  const openOrders = orders.filter((o) => o.status === "open");
  // Products, not product-and-place pairs: rice due at two places is one product.
  const dueCount = new Set(reorder.flatMap((g) => g.lines.map((l) => l.itemId))).size;
  const owedTotal = supplierList.reduce((n, s) => n + s.owed, 0);
  const day = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  // Out at one place while another still has some: worth a move, not a reorder.
  const outSomewhere = places.length > 1 ? tracked.filter((l) => !isOut(l) && l.at.some((a) => a.available <= 0)).length : 0;
  const shown = show === "low" ? low : show === "out" ? out : tracked;
  const multi = places.length > 1;
  const filteredItem = itemFilter ? lines.find((l) => l.itemId === itemFilter) : undefined;
  // A product's reorder rule (0133), only where it can be set.
  const rule =
    filteredItem && canBuy && canAdjust && tab === "moves"
      ? ((await supabaseServer().from("catalogue_item").select("reorder_quantity, preferred_supplier_id").eq("id", filteredItem.itemId).maybeSingle()).data as {
          reorder_quantity: number | string | null;
          preferred_supplier_id: string | null;
        } | null)
      : null;

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
              <Link href="/inventory/count" className={secondaryAction}>
                Count the shelf
              </Link>
              {canMove && places.length > 1 && <SendTransfer businessId={businessId} places={places} items={adjustItems} />}
              <AdjustStock businessId={businessId} places={places} items={adjustItems} startWith={itemFilter} />
              {canBuy && (
                <PlaceOrder
                  businessId={businessId}
                  businessName={businessName}
                  places={places}
                  items={lines.map((l) => ({ id: l.itemId, name: l.name, averageCost: costs.get(l.itemId) ?? null, tracksExpiry: expiring.has(l.itemId) }))}
                  suppliers={supplierList.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
                />
              )}
              <ReceiveStock
                businessId={businessId}
                places={places}
                items={lines.map((l) => ({ id: l.itemId, name: l.name, averageCost: costs.get(l.itemId) ?? null, tracksExpiry: expiring.has(l.itemId) }))}
                supplierNames={canBuy ? supplierList.map((s) => s.name) : undefined}
              />
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

          {waiting.length > 0 && tab !== "counts" && canAdjust && (
            <Link href="/inventory?tab=counts" className="tap mb-4 flex min-h-[44px] items-center justify-between gap-3 rounded-[18px] border border-gold-500/40 bg-gold-100 px-5 py-3 text-[13.5px] font-semibold text-gold-700">
              <span>
                {waiting.length === 1 ? "A stock count is" : `${waiting.length} stock counts are`} waiting for you to approve.
              </span>
              <span className="flex-none underline">See the count</span>
            </Link>
          )}

          {expirySum && expirySum.expiredBatches > 0 && tab !== "expiry" && (
            <Link href="/inventory?tab=expiry" className="tap mb-4 flex min-h-[44px] items-center justify-between gap-3 rounded-[18px] border border-danger/30 bg-danger-tint px-5 py-3 text-[13.5px] font-semibold text-danger-ink">
              <span>
                Expired stock is still on your shelf: {formatGHS(expirySum.expiredValue)} in {expirySum.expiredBatches} {expirySum.expiredBatches === 1 ? "batch" : "batches"}.
              </span>
              <span className="flex-none underline">See what expired</span>
            </Link>
          )}

          {dueCount > 0 && tab !== "orders" && canAdjust && (
            <Link href="/inventory?tab=orders" className="tap mb-4 flex min-h-[44px] items-center justify-between gap-3 rounded-[18px] border border-gold-500/40 bg-gold-100 px-5 py-3 text-[13.5px] font-semibold text-gold-700">
              <span>{dueCount === 1 ? `${reorder[0].lines[0].item} is` : `${dueCount} products are`} at the point you reorder.</span>
              <span className="flex-none underline">See what to order</span>
            </Link>
          )}

          {onTheWay.length > 0 && tab !== "transfers" && (
            <Link href="/inventory?tab=transfers" className="tap mb-4 flex min-h-[44px] items-center justify-between gap-3 rounded-[18px] border border-line-brand bg-teal-50 px-5 py-3 text-[13.5px] font-semibold text-teal-800">
              <span>
                {onTheWay.length === 1 ? `Stock is on the way to ${onTheWay[0].to}.` : `${onTheWay.length} lots of stock are on the way between your places.`}
              </span>
              <span className="flex-none underline">See transfers</span>
            </Link>
          )}

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

          <div role="tablist" aria-label="Inventory views" className="mb-4 flex gap-1 overflow-x-auto border-b border-line-brand [scrollbar-width:none]">
            {[
              ["stock", multi ? "Stock by place" : "Stock"],
              ["moves", "Movements"],
              ["counts", waiting.length ? `Counts (${waiting.length} waiting)` : "Counts"],
              ...(canMove ? [["transfers", onTheWay.length ? `Transfers (${onTheWay.length} on the way)` : "Transfers"]] : []),
              ...(canBuy
                ? [
                    ["orders", dueCount ? `Orders (${dueCount} to reorder)` : openOrders.length ? `Orders (${openOrders.length} open)` : "Orders"],
                    ["suppliers", "Suppliers"],
                  ]
                : []),
              ...(canValue ? [["value", "Value"]] : []),
              ...(canExpiry
                ? [["expiry", expirySum && expirySum.expiredBatches > 0 ? `Expiry (${expirySum.expiredBatches} expired)` : "Expiry"]]
                : []),
            ].map(([k, label]) => (
              <Link
                key={k}
                role="tab"
                aria-selected={tab === k}
                href={link({ tab: k })}
                className={`tap flex min-h-[44px] flex-none items-center whitespace-nowrap border-b-2 px-3 text-[14px] font-semibold ${
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
                            <span
                              className={
                                l.at[j].available <= 0
                                  ? "font-semibold text-danger-ink"
                                  : l.at[j].available <= (lowAt(p.id, l) ?? -1)
                                    ? "font-semibold text-gold-700"
                                    : undefined
                              }
                            >
                              {l.at[j].available <= 0
                                ? `${qty(l.at[j].available)}, out`
                                : l.at[j].available <= (lowAt(p.id, l) ?? -1)
                                  ? `${qty(l.at[j].available)}, low`
                                  : qty(l.at[j].available)}
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
              {filteredItem && rule && (
                <ReorderRule
                  key={`reorder-${filteredItem.itemId}`}
                  businessId={businessId}
                  itemId={filteredItem.itemId}
                  itemName={filteredItem.name}
                  lowAt={filteredItem.lowAt}
                  reorderQuantity={rule.reorder_quantity === null ? null : Number(rule.reorder_quantity)}
                  supplierId={rule.preferred_supplier_id}
                  suppliers={supplierList.map((x) => ({ id: x.id, name: x.name }))}
                />
              )}
              {filteredItem && canExpiry && canAdjust && (
                <ExpirySwitch key={`expiry-${filteredItem.itemId}`} businessId={businessId} itemId={filteredItem.itemId} itemName={filteredItem.name} on={expiring.has(filteredItem.itemId)} />
              )}
              {filteredItem && rule && multi && (
                <PlaceLowMarks
                  key={`marks-${filteredItem.itemId}`}
                  businessId={businessId}
                  itemId={filteredItem.itemId}
                  itemName={filteredItem.name}
                  productMark={filteredItem.lowAt}
                  places={places.map((pl) => ({ id: pl.id, name: pl.name, mark: placeMarks.get(`${pl.id}|${filteredItem.itemId}`) ?? null }))}
                />
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

          {tab === "value" && (
            <>
              {values.length > 0 && (
                <>
                  <FigureRow
                    figures={[
                      {
                        label: "Stock at cost",
                        value: formatGHS(values.reduce((n, v) => n + v.atCost, 0)),
                        sub: "What you paid for what is on the shelf",
                      },
                      {
                        label: "At your selling prices",
                        value: formatGHS(values.reduce((n, v) => n + v.atPrice, 0)),
                        sub: values.some((v) => v.uncosted > 0)
                          ? "At today's prices, including products with no cost yet"
                          : "If all of it sold at today's prices",
                      },
                    ]}
                  />
                  {multi && (
                    <Panel className="mb-4">
                      {values.map((v, i) => (
                        <div key={v.placeId} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-[13.5px] ${i ? "border-t border-neutral-100" : ""}`}>
                          <span className="font-semibold text-ink">{places.find((pl) => pl.id === v.placeId)?.name ?? "A place"}</span>
                          <span className="num text-neutral-700">
                            {formatGHS(v.atCost)} at cost · {formatGHS(v.atPrice)} at prices · {qty(v.units)} items
                          </span>
                        </div>
                      ))}
                    </Panel>
                  )}
                  {values.some((v) => v.uncosted > 0) && (
                    <p className="-mt-1 mb-4 text-[12.5px] text-neutral-600">
                      {values.reduce((n, v) => n + v.uncosted, 0)} {values.reduce((n, v) => n + v.uncosted, 0) === 1 ? "product on the shelf has" : "products on the shelf have"} no cost yet, so
                      {" "}stock at cost leaves {values.reduce((n, v) => n + v.uncosted, 0) === 1 ? "it" : "them"} out. Add the cost when you next receive {values.reduce((n, v) => n + v.uncosted, 0) === 1 ? "it" : "them"}.
                    </p>
                  )}
                </>
              )}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">What each product earned, last 30 days</p>
              {margins.length === 0 ? (
                <EmptyState title="No sales in the last 30 days." detail="Once products sell, each one shows what it sold for, what it cost you and what you kept." />
              ) : (
                <Panel>
                  <div
                    aria-hidden
                    className="hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 lg:grid lg:grid-cols-[minmax(0,1fr)_80px_120px_120px_140px] lg:gap-4"
                  >
                    <span>Product</span>
                    <span className="text-right">Sold</span>
                    <span className="text-right">Sales</span>
                    <span className="text-right">Cost</span>
                    <span className="text-right">You kept</span>
                  </div>
                  {margins.map((m, i) => (
                    <div
                      key={m.itemId}
                      className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] lg:grid lg:grid-cols-[minmax(0,1fr)_80px_120px_120px_140px] lg:gap-4 ${i ? "border-t border-neutral-100" : ""}`}
                    >
                      <span className="min-w-0 basis-full truncate font-semibold text-ink lg:basis-auto">{m.name}</span>
                      <span className="num text-neutral-700 lg:text-right">
                        <span className="lg:hidden">Sold </span>
                        {qty(m.units)}
                      </span>
                      <span className="num text-neutral-700 lg:text-right">
                        <span className="lg:hidden">for </span>
                        {formatGHS(m.sales)}
                      </span>
                      <span className="num text-neutral-700 lg:text-right">
                        <span className="lg:hidden">cost </span>
                        {m.cost === null ? "not known" : formatGHS(m.cost)}
                      </span>
                      <span className={`num font-semibold lg:text-right ${m.margin === null ? "text-neutral-500" : m.margin < 0 ? "text-danger-ink" : "text-teal-800"}`}>
                        {m.margin !== null && <span className="font-normal text-neutral-600 lg:hidden">kept </span>}
                        {m.margin === null
                          ? "Add a cost to see"
                          : `${formatGHS(m.margin)}${m.sales > 0 ? `, ${Math.round((100 * m.margin) / m.sales)}%` : ""}`}
                      </span>
                    </div>
                  ))}
                </Panel>
              )}
              <p className="mt-3 text-[12.5px] text-neutral-600">
                Cost is what you paid on average when each sale was made. Sales are what customers were charged, after discounts. Each product stands on its own; this is not your profit, which also pays rent, wages and transport.
              </p>
            </>
          )}

          {tab === "expiry" && (
            <>
              {expiry.length === 0 ? (
                <EmptyState
                  title={expiring.size === 0 ? "No product keeps expiry dates yet." : "Nothing expires in the next 30 days."}
                  detail={
                    expiring.size === 0
                      ? "Open a product from Stock and switch on Has expiry dates. From then on Receive stock asks for the date on the box."
                      : "Batches that expire within 30 days show here, oldest first, so you can sell them or move them in time."
                  }
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {[
                    ["Expired", expiry.filter((r) => r.daysLeft < 0)],
                    ["Expiring in the next 30 days", expiry.filter((r) => r.daysLeft >= 0)],
                  ].map(([title, rows]) =>
                    (rows as ExpiryRow[]).length === 0 ? null : (
                      <section key={title as string}>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">{title as string}</p>
                        <Panel>
                          {(rows as ExpiryRow[]).map((r, i) => (
                            <div key={r.batchId} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 ${i ? "border-t border-neutral-100" : ""}`}>
                              <span className="min-w-0">
                                <span className="block text-[14px] font-semibold text-ink">{r.item}</span>
                                <span className="block text-[12.5px] text-neutral-600">
                                  {[
                                    r.daysLeft < 0
                                      ? `Expired ${day(r.expiresOn)}`
                                      : r.daysLeft === 0
                                        ? "Expires today"
                                        : `Expires ${day(r.expiresOn)}, in ${r.daysLeft} ${r.daysLeft === 1 ? "day" : "days"}`,
                                    r.batchCode ? `batch ${r.batchCode}` : null,
                                    multi ? r.place : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </span>
                              <span className={`num flex-none text-[14px] font-semibold ${r.daysLeft < 0 ? "text-danger-ink" : r.daysLeft <= 7 ? "text-gold-700" : "text-ink"}`}>
                                {qty(r.quantity)} left{r.value > 0 ? `, ${formatGHS(r.value)}` : ""}
                              </span>
                              {r.daysLeft < 0 && canAdjust && (
                                <WriteOffExpired businessId={businessId} batchId={r.batchId} label={`${qty(r.quantity)} ${r.item}`} value={r.value} />
                              )}
                            </div>
                          ))}
                        </Panel>
                      </section>
                    )
                  )}
                </div>
              )}
              {expirySum && expirySum.unknownQuantity > 0 && (
                <p className="mt-3 text-[12.5px] text-neutral-600">
                  {qty(expirySum.unknownQuantity)} {expirySum.unknownQuantity === 1 ? "item has" : "items have"} no expiry date known: stock from before dates were switched on, or received without one. Ascend sells dated batches first, so check these boxes by hand.
                </p>
              )}
            </>
          )}

          {tab === "orders" && (
            <>
              {reorder.length > 0 && canAdjust && (
                <section aria-label="Running low" className="mb-5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">Running low</p>
                  <div className="flex flex-col gap-3">
                    {reorder.map((g) => (
                      <Panel key={`${g.supplierId ?? "none"}-${g.placeId}`} className="border-gold-500/40 px-5 py-4">
                        <p className="text-[14.5px] font-semibold text-ink">
                          {g.supplier ? `From ${g.supplier}` : "No usual supplier yet"}
                          {multi ? <span className="font-normal text-neutral-600"> · for {g.place}</span> : null}
                        </p>
                        <div className="mt-2 overflow-hidden rounded-control border border-neutral-100">
                          {g.lines.map((l, i) => (
                            <div key={l.itemId} className={`flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-[13px] ${i ? "border-t border-neutral-100" : ""}`}>
                              <Link href={link({ tab: "moves", item: l.itemId })} className="min-w-0 font-semibold text-ink underline-offset-2 hover:underline">
                                {l.item}
                              </Link>
                              <span className="num text-neutral-700">
                                {qty(l.available)} left, reorder at {qty(l.lowAt)}
                                {l.onOrder > 0 ? `, ${qty(l.onOrder)} on order` : ""}
                                {l.quantity !== null ? ` · order ${qty(l.quantity)}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <PlaceOrder
                            businessId={businessId}
                            businessName={businessName}
                            places={places}
                            items={lines.map((l) => ({ id: l.itemId, name: l.name, averageCost: costs.get(l.itemId) ?? null, tracksExpiry: expiring.has(l.itemId) }))}
                            suppliers={supplierList.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
                            draft={{ supplierId: g.supplierId, placeId: g.placeId, lines: g.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost })) }}
                          />
                        </div>
                      </Panel>
                    ))}
                  </div>
                </section>
              )}
              {orders.length === 0 ? (
                <EmptyState
                  title="No stock orders yet."
                  detail="Tap Order stock to write up what you want from a supplier and send it to them on WhatsApp. When it comes, receive it against the order."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {orders.map((o) => {
                    const anyReceived = o.lines.some((l) => l.received > 0);
                    const late = o.status === "open" && o.expectedOn !== null && o.expectedOn < new Date().toISOString().slice(0, 10);
                    return (
                      <Panel key={o.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="text-[14.5px] font-semibold text-ink">
                            {o.number ?? "Order"} · {o.supplier}
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                              o.status === "open"
                                ? late
                                  ? "bg-danger-tint text-danger-ink"
                                  : anyReceived
                                    ? "bg-gold-100 text-gold-700"
                                    : "bg-info-light text-info-ink"
                                : o.status === "received"
                                  ? "bg-teal-50 text-teal-800"
                                  : "bg-neutral-100 text-neutral-700"
                            }`}
                          >
                            {o.status === "open"
                              ? late
                                ? "Late"
                                : anyReceived
                                  ? "Part arrived"
                                  : "Waiting"
                              : o.status === "received"
                                ? "All arrived"
                                : o.status === "closed"
                                  ? "Closed short"
                                  : "Cancelled"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-neutral-600">
                          {[
                            `Ordered ${day(o.orderedAt)}${o.orderedBy ? ` by ${o.orderedBy}` : ""}`,
                            o.expectedOn && o.status === "open" ? `expected ${day(o.expectedOn)}` : null,
                            multi ? `to ${o.place}` : null,
                            o.total > 0 ? formatGHS(o.total) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {(o.note || o.closeNote) && (
                          <p className="mt-1 text-[12.5px] text-neutral-700">{[o.note, o.closeNote].filter(Boolean).map((n) => `\u201c${n}\u201d`).join(" · ")}</p>
                        )}
                        <div className="mt-2 overflow-hidden rounded-control border border-neutral-100">
                          {o.lines.map((l, i) => (
                            <div key={l.itemId} className={`flex items-baseline justify-between gap-3 px-3 py-2 text-[13px] ${i ? "border-t border-neutral-100" : ""}`}>
                              <span className="min-w-0 text-ink">{l.item}</span>
                              <span className={`num flex-none ${l.received >= l.ordered ? "text-teal-800" : o.status === "open" ? "text-neutral-700" : "font-semibold text-danger-ink"}`}>
                                {qty(l.received)} of {qty(l.ordered)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {o.status === "open" && canAdjust && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <ReceiveStock
                              businessId={businessId}
                              places={places}
                              items={lines.map((l) => ({ id: l.itemId, name: l.name, averageCost: costs.get(l.itemId) ?? null, tracksExpiry: expiring.has(l.itemId) }))}
                              order={{
                                id: o.id,
                                number: o.number,
                                supplier: o.supplier,
                                placeId: o.placeId,
                                place: o.place,
                                lines: o.lines.map((l) => ({ itemId: l.itemId, remaining: Math.max(l.ordered - l.received, 0), unitCost: l.unitCost })),
                              }}
                            />
                            {o.supplierPhone && o.number && (
                              <a
                                href={whatsappLink(
                                  o.supplierPhone,
                                  orderMessage({
                                    businessName,
                                    number: o.number,
                                    place: o.place,
                                    expectedOn: o.expectedOn,
                                    lines: o.lines.filter((l) => l.received < l.ordered).map((l) => ({ item: l.item, quantity: l.ordered - l.received })),
                                  })
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="tap flex min-h-[44px] items-center rounded-control px-3 text-[13.5px] font-semibold text-teal-800 hover:bg-teal-50"
                              >
                                Send on WhatsApp
                              </a>
                            )}
                            <a href={`/api/documents/${o.id}/pdf`} target="_blank" rel="noreferrer" className="tap flex min-h-[44px] items-center rounded-control px-3 text-[13.5px] font-semibold text-teal-800 hover:bg-teal-50">
                              Download
                            </a>
                            <OrderClose businessId={businessId} documentId={o.id} anyReceived={anyReceived} />
                          </div>
                        )}
                      </Panel>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "suppliers" && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] text-neutral-700">
                  {owedTotal > 0 ? (
                    <>
                      You owe suppliers <strong className="num text-ink">{formatGHS(owedTotal)}</strong> for deliveries not paid yet.
                    </>
                  ) : supplierList.length ? (
                    "Every delivery with a cost is paid for."
                  ) : null}
                </p>
                {canAdjust && <SupplierForm businessId={businessId} />}
              </div>
              {supplierList.length === 0 ? (
                <EmptyState
                  title="No suppliers yet."
                  detail="Add the people you buy from, with their WhatsApp number and when you pay them. Orders and deliveries then sit under each one."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {supplierList.map((s) => (
                    <Panel key={s.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-ink">{s.name}</p>
                          <p className="text-[12.5px] text-neutral-600">
                            {[s.contactName, s.phone, s.paymentTerms ? `Terms: ${s.paymentTerms}` : null].filter(Boolean).join(" · ") || "No contact details yet"}
                          </p>
                        </div>
                        {canAdjust && <SupplierForm businessId={businessId} supplier={s} />}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-[12.5px] text-neutral-600">
                        <span>
                          <span className={`num block font-heading text-[17px] font-extrabold ${s.owed > 0 ? "text-danger-ink" : "text-ink-heading"}`}>{formatGHS(s.owed)}</span>
                          Owed
                        </span>
                        <span>
                          <span className="num block font-heading text-[17px] font-extrabold text-ink-heading">{formatGHS(s.onOrderValue)}</span>
                          {s.openOrders ? `On ${s.openOrders} open ${s.openOrders === 1 ? "order" : "orders"}` : "On order"}
                        </span>
                        <span>
                          <span className="num block font-heading text-[17px] font-extrabold text-ink-heading">{formatGHS(s.delivered90d)}</span>
                          Delivered, 90 days
                        </span>
                      </div>
                      {s.unpaid.length > 0 && (
                        <div className="mt-3 overflow-hidden rounded-control border border-neutral-100">
                          {s.unpaid.map((u, i) => (
                            <div key={u.receiptId} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-[13px] ${i ? "border-t border-neutral-100" : ""}`}>
                              <span className="min-w-0 text-ink">
                                Delivered {day(u.receivedAt)}
                                <span className="text-neutral-600">
                                  {u.reference ? ` · ${u.reference}` : ""}
                                  {multi ? ` · ${u.place}` : ""}
                                </span>
                              </span>
                              <span className="num font-semibold text-ink">{formatGHS(u.total)}</span>
                              {canAdjust && <PayDelivery businessId={businessId} receiptId={u.receiptId} amount={u.total} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "transfers" && (
            <>
              {places.length < 2 ? (
                <EmptyState title="Moving stock needs a second place." detail="Once your business has two places, send stock between them here. Talk to us to add one." />
              ) : transfers.length === 0 ? (
                <EmptyState title="No stock has moved between your places yet." detail="Tap Move stock to send goods from one place to another. Someone at the other place counts them in." />
              ) : (
                <div className="flex flex-col gap-3">
                  {onTheWay.length > 0 && (
                    <Link href="/inventory/arrivals" className="tap flex min-h-[44px] items-center justify-between gap-3 rounded-[18px] border border-line-brand bg-white px-5 py-3 text-[13.5px] font-semibold text-teal-800">
                      <span>Whoever is at the other place counts the goods in on their phone.</span>
                      <span className="flex-none underline">Open goods on the way</span>
                    </Link>
                  )}
                  {transfers.map((t) => (
                    <Panel key={t.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-[14.5px] font-semibold text-ink">
                          {t.from} to {t.to}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                            t.status === "sent"
                              ? "bg-gold-100 text-gold-700"
                              : t.status === "received" && t.missingLines > 0
                                ? "bg-danger-tint text-danger-ink"
                                : t.status === "received"
                                  ? "bg-teal-50 text-teal-800"
                                  : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {t.status === "sent" ? "On the way" : t.status === "received" ? (t.missingLines > 0 ? "Arrived short" : "Arrived") : "Called back"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-neutral-600">
                        Sent by {t.sentBy}, {when(t.sentAt)}
                        {t.status === "received" && t.receivedAt ? ` · counted in by ${t.receivedBy ?? "a team member"}, ${when(t.receivedAt)}` : ""}
                        {t.status === "cancelled" && t.cancelledAt ? ` · called back by ${t.cancelledBy ?? "a team member"}, ${when(t.cancelledAt)}` : ""}
                      </p>
                      {(t.note || t.receiveNote) && (
                        <p className="mt-1 text-[12.5px] text-neutral-700">
                          {[t.note, t.receiveNote].filter(Boolean).map((n) => `\u201c${n}\u201d`).join(" · ")}
                        </p>
                      )}
                      <div className="mt-2 overflow-hidden rounded-control border border-neutral-100">
                        {t.lines.map((l, i) => {
                          const short = l.received !== null && l.received < l.sent;
                          return (
                            <div key={l.itemId} className={`flex items-baseline justify-between gap-3 px-3 py-2 text-[13px] ${i ? "border-t border-neutral-100" : ""}`}>
                              <span className="min-w-0 text-ink">{l.item}</span>
                              <span className={`num flex-none ${short ? "font-semibold text-danger-ink" : "text-neutral-700"}`}>
                                {l.received === null ? `${qty(l.sent)} sent` : short ? `${qty(l.received)} of ${qty(l.sent)} arrived` : `${qty(l.sent)} arrived`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {t.status === "received" && t.missingLines > 0 && (
                        <p className="mt-2 text-[13px] text-danger-ink">
                          {t.missingValue > 0 ? `${formatGHS(t.missingValue)} written off` : "Written off"} at {t.to} as lost on the way.
                        </p>
                      )}
                      {t.status === "sent" && canAdjust && (
                        <div className="mt-2">
                          <TransferCancel businessId={businessId} transferId={t.id} from={t.from} />
                        </div>
                      )}
                    </Panel>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "counts" && (
            <>
              {counts.length === 0 ? (
                <EmptyState
                  title="No stock counts yet."
                  detail="Count the shelf on any phone. Anyone on your team can do it, and you approve what they find."
                  action={
                    <Link href="/inventory/count" className="tap inline-flex min-h-[44px] items-center rounded-control bg-teal px-4 text-[14px] font-bold text-white">
                      Count the shelf
                    </Link>
                  }
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {counts.map((c) => (
                    <Panel key={c.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-[14.5px] font-semibold text-ink">
                          {c.lines} {c.lines === 1 ? "product" : "products"} counted by {c.countedBy}
                          {multi ? ` at ${c.place}` : ""}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                            c.status === "waiting" ? "bg-gold-100 text-gold-700" : c.status === "posted" ? "bg-teal-50 text-teal-800" : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {c.status === "waiting" ? "Waiting for approval" : c.status === "posted" ? "On the shelf" : "Turned down"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-neutral-600">
                        {when(c.countedAt)}
                        {c.decidedBy && c.status !== "waiting" ? ` · ${c.status === "posted" ? "approved" : "turned down"} by ${c.decidedBy}` : ""}
                        {c.note ? ` · \u201c${c.note}\u201d` : ""}
                      </p>
                      <p className="mt-2 text-[13.5px] text-neutral-700">
                        {c.differing === 0
                          ? "Every product matched the record."
                          : `${c.differing} differed: ${formatGHS(c.writeDown)} short${c.writeUp > 0 ? `, ${formatGHS(c.writeUp)} more than recorded` : ""}.`}
                      </p>
                      {c.differences.length > 0 && (
                        <div className="mt-2 overflow-hidden rounded-control border border-neutral-100">
                          {c.differences.slice(0, 12).map((d, i) => (
                            <div key={i} className={`flex items-baseline justify-between gap-3 px-3 py-2 text-[13px] ${i ? "border-t border-neutral-100" : ""}`}>
                              <span className="min-w-0 text-ink">
                                {d.item}
                                <span className="text-neutral-600">
                                  {" "}
                                  · record {qty(d.expected)}, counted {qty(d.counted)}
                                </span>
                              </span>
                              <span className={`num flex-none font-semibold ${d.variance < 0 ? "text-danger-ink" : "text-teal-800"}`}>
                                {d.variance > 0 ? "+" : "\u2212"}
                                {qty(Math.abs(d.variance))}
                                {d.value !== 0 ? ` (${formatGHS(Math.abs(d.value))})` : ""}
                              </span>
                            </div>
                          ))}
                          {c.differences.length > 12 && <p className="border-t border-neutral-100 px-3 py-2 text-[12.5px] text-neutral-600">And {c.differences.length - 12} more.</p>}
                        </div>
                      )}
                      {c.status === "waiting" && canAdjust && (
                        <div className="mt-3">
                          {c.needsSecondPerson && (
                            <p className="mb-2 text-[12.5px] font-semibold text-gold-700">
                              This writes off more than GHS 500, so it needs someone other than {c.countedBy} to approve it.
                            </p>
                          )}
                          <CountDecision
                            businessId={businessId}
                            countId={c.id}
                            blocked={c.needsSecondPerson && c.countedById === membershipId ? "You counted this one, so someone else on the team must approve it." : undefined}
                          />
                        </div>
                      )}
                    </Panel>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
