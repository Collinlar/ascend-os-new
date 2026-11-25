import { supabaseServer } from "@/lib/supabase";

// Stock as the Inventory page reads it (Inventory Core plan, decision 10).
// On hand is the ledger summed (stock_balance, which leaves shop holds out);
// held is what open shop orders have set aside (stock_reserved); available
// is the difference, the figure a customer can still buy.

export interface Place {
  id: string;
  name: string;
}

export interface StockLine {
  itemId: string;
  name: string;
  category: string | null;
  tracked: boolean;
  lowAt: number | null;
  /** What the till does when it runs out: none, soft or hard (0127). */
  rule: "none" | "soft" | "hard";
  /** One entry per place, in the order of `places`. */
  at: { onHand: number; held: number; available: number }[];
  onHand: number;
  held: number;
  available: number;
  lastMovedAt: string | null;
}

export interface Movement {
  id: string;
  at: string;
  kind: string;
  quantity: number;
  item: string;
  place: string;
  reason: string | null;
  who: string | null;
  till: string | null;
}

export const KIND_LABEL: Record<string, string> = {
  opening_balance: "Opening count",
  restock: "Goods came in",
  sale: "Sold",
  customer_return: "Returned",
  damage_loss: "Damaged or lost",
  count_correction: "Counted",
  transfer_in: "Moved in",
  transfer_out: "Moved out",
  reservation: "Held for a shop order",
  reservation_release: "Shop hold released",
};

export async function stockLevels(businessId: string): Promise<{ places: Place[]; lines: StockLine[] }> {
  const db = supabaseServer();
  const [locs, items, bal, res] = await Promise.all([
    db.from("location").select("id, name").eq("business_id", businessId).eq("active", true).order("created_at"),
    db.from("catalogue_item").select("id, name, category, track_stock, low_stock_threshold, stock_enforcement").eq("business_id", businessId).eq("active", true).order("name"),
    db.from("stock_balance").select("location_id, item_id, quantity_on_hand, last_movement_at").eq("business_id", businessId).is("variant_id", null),
    db.from("stock_reserved").select("location_id, item_id, quantity_reserved").eq("business_id", businessId).is("variant_id", null),
  ]);
  if (locs.error || items.error || bal.error || res.error) throw new Error("stock_unavailable");
  const places = (locs.data ?? []).map((l) => ({ id: l.id as string, name: l.name as string }));
  const key = (l: string, i: string) => `${l}:${i}`;
  const onHand = new Map<string, number>();
  const last = new Map<string, string>();
  for (const b of bal.data ?? []) {
    onHand.set(key(b.location_id, b.item_id), Number(b.quantity_on_hand));
    const prev = last.get(b.item_id as string);
    if (b.last_movement_at && (!prev || b.last_movement_at > prev)) last.set(b.item_id as string, b.last_movement_at as string);
  }
  // Holds are written negative and releases positive, so the open hold is
  // the negated sum, never below zero.
  const held = new Map<string, number>();
  for (const r of res.data ?? []) held.set(key(r.location_id, r.item_id), Math.max(0, -Number(r.quantity_reserved)));

  const lines = (items.data ?? []).map((it) => {
    const at = places.map((p) => {
      const h = onHand.get(key(p.id, it.id)) ?? 0;
      const d = held.get(key(p.id, it.id)) ?? 0;
      return { onHand: h, held: d, available: h - d };
    });
    const sum = (f: (x: (typeof at)[number]) => number) => at.reduce((n, x) => n + f(x), 0);
    return {
      itemId: it.id as string,
      name: it.name as string,
      category: (it.category as string | null) ?? null,
      tracked: Boolean(it.track_stock),
      lowAt: it.low_stock_threshold === null ? null : Number(it.low_stock_threshold),
      rule: (it.stock_enforcement === "soft" || it.stock_enforcement === "hard" ? it.stock_enforcement : "none") as StockLine["rule"],
      at,
      onHand: sum((x) => x.onHand),
      held: sum((x) => x.held),
      available: sum((x) => x.available),
      lastMovedAt: last.get(it.id as string) ?? null,
    };
  });
  return { places, lines };
}

export function isLow(l: StockLine) {
  return l.tracked && l.available > 0 && l.lowAt !== null && l.available <= l.lowAt;
}
export function isOut(l: StockLine) {
  return l.tracked && l.available <= 0;
}
/** Sold more than was on record at any place: an offline till, or goods
 *  that came in and were never received. Judged per place, because stock at
 *  one shop does not make a negative shelf at another true. */
export function isBelowZero(l: StockLine) {
  return l.tracked && l.at.some((a) => a.onHand < 0);
}

export async function recentMovements(
  businessId: string,
  opts: { itemId?: string; placeId?: string; limit?: number } = {}
): Promise<Movement[]> {
  let q = supabaseServer()
    .from("stock_movement")
    .select(
      "id, occurred_at, kind, quantity, reason, item:item_id(name), place:location_id(name), device:device_id(label), actor:actor_membership_id(person:person_id(full_name))"
    )
    .eq("business_id", businessId)
    .order("occurred_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.itemId) q = q.eq("item_id", opts.itemId);
  if (opts.placeId) q = q.eq("location_id", opts.placeId);
  const { data, error } = await q;
  if (error) throw new Error("movements_unavailable");
  return (data ?? []).map((m) => {
    const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
    const actor = one<{ person: unknown }>(m.actor);
    return {
      id: m.id as string,
      at: m.occurred_at as string,
      kind: m.kind as string,
      quantity: Number(m.quantity),
      item: one<{ name: string }>(m.item)?.name ?? "A product",
      place: one<{ name: string }>(m.place)?.name ?? "",
      reason: (m.reason as string | null) ?? null,
      who: one<{ full_name: string }>(actor?.person)?.full_name ?? null,
      till: one<{ label: string }>(m.device)?.label ?? null,
    };
  });
}

// ----- Stock counts (Inventory Core I4, 0129) ------------------------------

export interface CountLine {
  item: string;
  expected: number;
  counted: number;
  variance: number;
  value: number;
  reason: string | null;
}

export interface StockCountView {
  id: string;
  status: "waiting" | "posted" | "rejected";
  place: string;
  countedBy: string;
  countedById: string;
  decidedBy: string | null;
  countedAt: string;
  decidedAt: string | null;
  note: string | null;
  decisionNote: string | null;
  lines: number;
  differing: number;
  writeDown: number;
  writeUp: number;
  needsSecondPerson: boolean;
  /** Only the lines that differ, biggest loss first. */
  differences: CountLine[];
}

/** Waiting counts first, then the latest decided ones. Empty when 0129 has
 *  not been applied, so the page still works without it. */
export async function stockCounts(businessId: string, limit = 20): Promise<StockCountView[]> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("stock_count")
    .select(
      "id, status, counted_at, decided_at, note, decision_note, lines, differing, write_down_value, write_up_value, needs_second_person, counted_by, place:location_id(name), counter:counted_by(person:person_id(full_name)), decider:decided_by(person:person_id(full_name))"
    )
    .eq("business_id", businessId)
    .order("counted_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const ids = data.map((c) => c.id as string);
  const { data: lineRows } = ids.length
    ? await db
        .from("stock_count_line")
        .select("count_id, expected, counted, variance, unit_value, reason, item:item_id(name)")
        .in("count_id", ids)
        .neq("variance", 0)
    : { data: [] };
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const byCount = new Map<string, CountLine[]>();
  for (const l of lineRows ?? []) {
    const list = byCount.get(l.count_id as string) ?? [];
    const variance = Number(l.variance);
    list.push({
      item: one<{ name: string }>(l.item)?.name ?? "A product",
      expected: Number(l.expected),
      counted: Number(l.counted),
      variance,
      value: Math.round(variance * Number(l.unit_value ?? 0) * 100) / 100,
      reason: (l.reason as string | null) ?? null,
    });
    byCount.set(l.count_id as string, list);
  }
  const views = data.map((c) => ({
    id: c.id as string,
    status: c.status as StockCountView["status"],
    place: one<{ name: string }>(c.place)?.name ?? "",
    countedBy: one<{ full_name: string }>(one<{ person: unknown }>(c.counter)?.person)?.full_name ?? "A team member",
    countedById: c.counted_by as string,
    decidedBy: one<{ full_name: string }>(one<{ person: unknown }>(c.decider)?.person)?.full_name ?? null,
    countedAt: c.counted_at as string,
    decidedAt: (c.decided_at as string | null) ?? null,
    note: (c.note as string | null) ?? null,
    decisionNote: (c.decision_note as string | null) ?? null,
    lines: Number(c.lines),
    differing: Number(c.differing),
    writeDown: Number(c.write_down_value),
    writeUp: Number(c.write_up_value),
    needsSecondPerson: Boolean(c.needs_second_person),
    differences: (byCount.get(c.id as string) ?? []).sort((a, b) => a.value - b.value),
  }));
  return [...views.filter((v) => v.status === "waiting"), ...views.filter((v) => v.status !== "waiting")];
}

// ---------------------------------------------------------------------------
// Transfers between places (Advanced Inventory A1, 0131)
// ---------------------------------------------------------------------------

export interface TransferLine {
  itemId: string;
  item: string;
  sent: number;
  /** Null until it arrives. Never shown to the person receiving. */
  received: number | null;
}

export interface StockTransferView {
  id: string;
  status: "sent" | "received" | "cancelled";
  from: string;
  fromId: string;
  to: string;
  toId: string;
  sentBy: string;
  receivedBy: string | null;
  cancelledBy: string | null;
  sentAt: string;
  receivedAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  receiveNote: string | null;
  missingLines: number;
  missingValue: number;
  lines: TransferLine[];
}

/** On the way first, then the latest that arrived or were called back.
 *  Empty when 0131 has not been applied, so the page still works without it. */
export async function stockTransfers(businessId: string, opts: { onTheWayOnly?: boolean; limit?: number } = {}): Promise<StockTransferView[]> {
  const db = supabaseServer();
  let query = db
    .from("stock_transfer")
    .select(
      "id, status, sent_at, received_at, cancelled_at, note, receive_note, missing_lines, missing_value, from_location_id, to_location_id, from:from_location_id(name), to:to_location_id(name), sender:sent_by(person:person_id(full_name)), receiver:received_by(person:person_id(full_name)), canceller:cancelled_by(person:person_id(full_name))"
    )
    .eq("business_id", businessId)
    .order("sent_at", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.onTheWayOnly) query = query.eq("status", "sent");
  const { data, error } = await query;
  if (error || !data) return [];
  const ids = data.map((t) => t.id as string);
  const { data: lineRows } = ids.length
    ? await db.from("stock_transfer_line").select("transfer_id, item_id, sent, received, item:item_id(name)").in("transfer_id", ids)
    : { data: [] };
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const who = (v: unknown) => one<{ full_name: string }>(one<{ person: unknown }>(v)?.person)?.full_name ?? null;
  const byTransfer = new Map<string, TransferLine[]>();
  for (const l of lineRows ?? []) {
    const list = byTransfer.get(l.transfer_id as string) ?? [];
    list.push({
      itemId: l.item_id as string,
      item: one<{ name: string }>(l.item)?.name ?? "A product",
      sent: Number(l.sent),
      received: l.received === null ? null : Number(l.received),
    });
    byTransfer.set(l.transfer_id as string, list);
  }
  const views: StockTransferView[] = data.map((t) => ({
    id: t.id as string,
    status: t.status as StockTransferView["status"],
    from: one<{ name: string }>(t.from)?.name ?? "",
    fromId: t.from_location_id as string,
    to: one<{ name: string }>(t.to)?.name ?? "",
    toId: t.to_location_id as string,
    sentBy: who(t.sender) ?? "A team member",
    receivedBy: who(t.receiver),
    cancelledBy: who(t.canceller),
    sentAt: t.sent_at as string,
    receivedAt: (t.received_at as string | null) ?? null,
    cancelledAt: (t.cancelled_at as string | null) ?? null,
    note: (t.note as string | null) ?? null,
    receiveNote: (t.receive_note as string | null) ?? null,
    missingLines: Number(t.missing_lines),
    missingValue: Number(t.missing_value),
    lines: (byTransfer.get(t.id as string) ?? []).sort((a, b) => a.item.localeCompare(b.item)),
  }));
  return [...views.filter((v) => v.status === "sent"), ...views.filter((v) => v.status !== "sent")];
}

// ---------------------------------------------------------------------------
// Suppliers and stock orders (Advanced Inventory A2, 0132)
// ---------------------------------------------------------------------------

export interface UnpaidDelivery {
  receiptId: string;
  receivedAt: string;
  total: number;
  reference: string | null;
  place: string;
}

export interface SupplierView {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  paymentTerms: string | null;
  notes: string | null;
  openOrders: number;
  onOrderValue: number;
  owed: number;
  delivered90d: number;
  lastDeliveryAt: string | null;
  unpaid: UnpaidDelivery[];
}

export interface StockOrderLineView {
  itemId: string;
  item: string;
  ordered: number;
  received: number;
  unitCost: number | null;
}

export interface StockOrderView {
  id: string;
  number: string | null;
  supplierId: string;
  supplier: string;
  supplierPhone: string | null;
  placeId: string;
  place: string;
  status: "open" | "received" | "closed" | "cancelled";
  expectedOn: string | null;
  note: string | null;
  orderedBy: string | null;
  orderedAt: string;
  receivedAt: string | null;
  closedAt: string | null;
  closeNote: string | null;
  total: number;
  lines: StockOrderLineView[];
}

/** Every active supplier with what is on order, owed and delivered, most
 *  owed first. Empty when 0132 has not been applied. */
export async function suppliers(businessId: string): Promise<SupplierView[]> {
  const db = supabaseServer();
  const [rows, ledger, unpaidRows] = await Promise.all([
    db.from("supplier").select("id, name, contact_name, phone_e164, payment_terms, notes").eq("business_id", businessId).eq("active", true).order("name"),
    db.rpc("supplier_ledger", { p_business: businessId }),
    db
      .from("stock_receipt")
      .select("id, supplier_id, received_at, total_cost, reference, place:location_id(name)")
      .eq("business_id", businessId)
      .not("supplier_id", "is", null)
      .gt("total_cost", 0)
      .order("received_at", { ascending: false })
      .limit(300),
  ]);
  if (rows.error || ledger.error || !rows.data) return [];
  const ids = (unpaidRows.data ?? []).map((r) => r.id as string);
  const { data: paidRows } = ids.length
    ? await db.from("financial_event").select("source_id").eq("source_type", "stock_receipt").eq("kind", "expense").in("source_id", ids)
    : { data: [] };
  const paid = new Set((paidRows ?? []).map((r) => r.source_id as string));
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const unpaidBy = new Map<string, UnpaidDelivery[]>();
  for (const r of unpaidRows.data ?? []) {
    if (paid.has(r.id as string)) continue;
    const list = unpaidBy.get(r.supplier_id as string) ?? [];
    list.push({
      receiptId: r.id as string,
      receivedAt: r.received_at as string,
      total: Number(r.total_cost),
      reference: (r.reference as string | null) ?? null,
      place: one<{ name: string }>(r.place)?.name ?? "",
    });
    unpaidBy.set(r.supplier_id as string, list);
  }
  const figures = new Map(
    ((ledger.data ?? []) as Record<string, unknown>[]).map((l) => [l.supplier_id as string, l])
  );
  return rows.data
    .map((s) => {
      const f = figures.get(s.id as string) ?? {};
      return {
        id: s.id as string,
        name: s.name as string,
        contactName: (s.contact_name as string | null) ?? null,
        phone: (s.phone_e164 as string | null) ?? null,
        paymentTerms: (s.payment_terms as string | null) ?? null,
        notes: (s.notes as string | null) ?? null,
        openOrders: Number(f.open_orders ?? 0),
        onOrderValue: Number(f.on_order_value ?? 0),
        owed: Number(f.owed ?? 0),
        delivered90d: Number(f.delivered_90d ?? 0),
        lastDeliveryAt: (f.last_delivery_at as string | null) ?? null,
        unpaid: (unpaidBy.get(s.id as string) ?? []).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
      };
    })
    .sort((a, b) => b.owed - a.owed || b.onOrderValue - a.onOrderValue || a.name.localeCompare(b.name));
}

/** Open orders first, then the latest finished ones. */
export async function stockOrders(businessId: string, limit = 30): Promise<StockOrderView[]> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("stock_order")
    .select(
      "document_id, supplier_id, location_id, status, expected_on, note, ordered_at, received_at, closed_at, close_note, doc:document!stock_order_document_id_fkey(number, total), supplier:supplier_id(name, phone_e164), place:location_id(name), orderer:ordered_by(person:person_id(full_name))"
    )
    .eq("business_id", businessId)
    .order("ordered_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const ids = data.map((o) => o.document_id as string);
  const { data: lineRows } = ids.length
    ? await db.from("stock_order_line").select("document_id, item_id, ordered, received, unit_cost, item:item_id(name)").in("document_id", ids)
    : { data: [] };
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;
  const byOrder = new Map<string, StockOrderLineView[]>();
  for (const l of lineRows ?? []) {
    const list = byOrder.get(l.document_id as string) ?? [];
    list.push({
      itemId: l.item_id as string,
      item: one<{ name: string }>(l.item)?.name ?? "A product",
      ordered: Number(l.ordered),
      received: Number(l.received),
      unitCost: l.unit_cost === null ? null : Number(l.unit_cost),
    });
    byOrder.set(l.document_id as string, list);
  }
  const views: StockOrderView[] = data.map((o) => {
    const doc = one<{ number: string | null; total: number | string | null }>(o.doc);
    const sup = one<{ name: string; phone_e164: string | null }>(o.supplier);
    return {
      id: o.document_id as string,
      number: doc?.number ?? null,
      supplierId: o.supplier_id as string,
      supplier: sup?.name ?? "A supplier",
      supplierPhone: sup?.phone_e164 ?? null,
      placeId: o.location_id as string,
      place: one<{ name: string }>(o.place)?.name ?? "",
      status: o.status as StockOrderView["status"],
      expectedOn: (o.expected_on as string | null) ?? null,
      note: (o.note as string | null) ?? null,
      orderedBy: one<{ full_name: string }>(one<{ person: unknown }>(o.orderer)?.person)?.full_name ?? null,
      orderedAt: o.ordered_at as string,
      receivedAt: (o.received_at as string | null) ?? null,
      closedAt: (o.closed_at as string | null) ?? null,
      closeNote: (o.close_note as string | null) ?? null,
      total: Number(doc?.total ?? 0),
      lines: (byOrder.get(o.document_id as string) ?? []).sort((a, b) => a.item.localeCompare(b.item)),
    };
  });
  return [...views.filter((v) => v.status === "open"), ...views.filter((v) => v.status !== "open")];
}

// ---------------------------------------------------------------------------
// Reorder rules (Advanced Inventory A3, 0133)
// ---------------------------------------------------------------------------

export interface ReorderLine {
  itemId: string;
  item: string;
  available: number;
  lowAt: number;
  onOrder: number;
  /** The rule's quantity, or null when the owner decides each time. */
  quantity: number | null;
  unitCost: number | null;
}

export interface ReorderGroup {
  supplierId: string | null;
  supplier: string | null;
  placeId: string;
  place: string;
  lines: ReorderLine[];
}

/** What is at or under its low mark and not already on order, grouped by
 *  usual supplier and place: one draft order per group. */
export async function reorderGroups(businessId: string): Promise<ReorderGroup[]> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("reorder_suggestions", { p_business: businessId });
  if (error || !data || data.length === 0) return [];
  const rows = data as { location_id: string; item_id: string; available: number; low_at: number; on_order: number; reorder_quantity: number | null; supplier_id: string | null; unit_cost: number | null }[];
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)));
  const supIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean))) as string[];
  const placeIds = Array.from(new Set(rows.map((r) => r.location_id)));
  const [items, sups, places] = await Promise.all([
    db.from("catalogue_item").select("id, name").in("id", itemIds),
    supIds.length ? db.from("supplier").select("id, name").in("id", supIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    db.from("location").select("id, name").in("id", placeIds),
  ]);
  const name = (list: { id: unknown; name: unknown }[] | null | undefined) => new Map((list ?? []).map((x) => [x.id as string, x.name as string]));
  const itemName = name(items.data), supName = name(sups.data), placeName = name(places.data);
  const groups = new Map<string, ReorderGroup>();
  for (const r of rows) {
    const key = `${r.supplier_id ?? "none"}|${r.location_id}`;
    const g = groups.get(key) ?? {
      supplierId: r.supplier_id,
      supplier: r.supplier_id ? supName.get(r.supplier_id) ?? null : null,
      placeId: r.location_id,
      place: placeName.get(r.location_id) ?? "",
      lines: [],
    };
    g.lines.push({
      itemId: r.item_id,
      item: itemName.get(r.item_id) ?? "A product",
      available: Number(r.available),
      lowAt: Number(r.low_at),
      onOrder: Number(r.on_order),
      quantity: r.reorder_quantity === null ? null : Number(r.reorder_quantity),
      unitCost: r.unit_cost === null ? null : Number(r.unit_cost),
    });
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => a.item.localeCompare(b.item)) }))
    .sort((a, b) => (a.supplier === null ? 1 : b.supplier === null ? -1 : a.supplier.localeCompare(b.supplier)) || a.place.localeCompare(b.place));
}
