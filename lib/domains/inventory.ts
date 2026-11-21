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
