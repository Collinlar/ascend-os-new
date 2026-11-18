import "server-only";

// The Sales page (v3 design, D3): every sale from the till, the shop,
// bookings and invoices, newest first, read from the commerce core; and the
// till's shifts with what each drawer was expected to hold and what was
// counted. Reads only.

import { supabaseServer } from "@/lib/supabase";

export type SalesChannel = "pos" | "shop" | "services" | "documents";

export interface SaleRow {
  id: string;
  at: string;
  channel: string;
  reference: string | null;
  where: string | null;
  who: string | null;
  items: string;
  total: number;
  status: string;
  method: string | null;
  verified: boolean;
  methods: number;
}

export interface ShiftRow {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  till: string | null;
  cashier: string | null;
  expected: number | null;
  counted: number | null;
  difference: number | null;
  note: string | null;
}

export const SALES_LIMIT = 100;

type Db = ReturnType<typeof supabaseServer>;

async function names(db: Db, membershipIds: string[]): Promise<Map<string, string>> {
  if (membershipIds.length === 0) return new Map();
  const { data } = await db
    .from("business_membership")
    .select("id, person:person_id(full_name)")
    .in("id", membershipIds);
  return new Map(
    (data ?? []).map((m) => [
      m.id as string,
      ((m.person as unknown as { full_name: string | null } | null)?.full_name ?? "").split(/\s+/)[0] || "Staff",
    ])
  );
}

async function deviceLabels(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await db.from("device_registration").select("id, label").in("id", ids);
  return new Map((data ?? []).map((d) => [d.id as string, (d.label as string | null) ?? "Till"]));
}

const unique = <T,>(xs: Array<T | null | undefined>) => Array.from(new Set(xs.filter((x): x is T => x != null)));

/** The latest sales, or null if the core could not be read. */
export async function loadSales(businessId: string, channel: SalesChannel | null): Promise<SaleRow[] | null> {
  const db = supabaseServer();
  let query = db
    .from("commercial_transaction")
    .select("id, earned_at, channel, origin_type, origin_id, total, status, actor_membership_id")
    .eq("business_id", businessId)
    .not("earned_at", "is", null)
    .not("status", "in", "(draft,cancelled)")
    .order("earned_at", { ascending: false })
    .limit(SALES_LIMIT);
  if (channel) query = query.eq("channel", channel);
  const { data: txs, error } = await query;
  if (error) return null;
  const rows = txs ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((t) => t.id as string);

  const saleIds = rows.filter((t) => t.origin_type === "sale").map((t) => t.origin_id as string);
  const docIds = rows.filter((t) => t.origin_type === "document").map((t) => t.origin_id as string);

  const [lines, obligations, sales, docs] = await Promise.all([
    db
      .from("transaction_line")
      .select("transaction_id, description, quantity, line_number, item:item_id(name)")
      .in("transaction_id", ids)
      .order("line_number"),
    db.from("payment_obligation").select("id, transaction_id").in("transaction_id", ids),
    saleIds.length
      ? db.from("sale").select("id, receipt_number, device_id, cashier_membership_id").in("id", saleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; receipt_number: string | null; device_id: string | null; cashier_membership_id: string | null }> }),
    docIds.length
      ? db.from("document").select("id, number").in("id", docIds)
      : Promise.resolve({ data: [] as Array<{ id: string; number: string | null }> }),
  ]);

  const obl = obligations.data ?? [];
  const allocations = obl.length
    ? (await db.from("payment_allocation").select("obligation_id, payment_id").in("obligation_id", obl.map((o) => o.id as string))).data ?? []
    : [];
  const payments = allocations.length
    ? (await db
        .from("payment")
        .select("id, method, verification, status, amount")
        .in("id", unique(allocations.map((a) => a.payment_id as string)))).data ?? []
    : [];

  const saleById = new Map((sales.data ?? []).map((s) => [s.id as string, s]));
  const docById = new Map((docs.data ?? []).map((d) => [d.id as string, d]));
  const [people, tills] = await Promise.all([
    names(db, unique([...rows.map((t) => t.actor_membership_id as string | null), ...(sales.data ?? []).map((s) => s.cashier_membership_id)])),
    deviceLabels(db, unique((sales.data ?? []).map((s) => s.device_id))),
  ]);

  const linesBy = new Map<string, string[]>();
  for (const l of lines.data ?? []) {
    const name = (l.item as unknown as { name: string } | null)?.name ?? (l.description as string) ?? "Item";
    const q = Number(l.quantity);
    const list = linesBy.get(l.transaction_id as string) ?? [];
    list.push(q === 1 ? name : `${name} x ${q % 1 === 0 ? q : q.toFixed(2)}`);
    linesBy.set(l.transaction_id as string, list);
  }
  const txByObligation = new Map(obl.map((o) => [o.id as string, o.transaction_id as string]));
  const payById = new Map(payments.map((p) => [p.id as string, p]));
  const paysBy = new Map<string, Array<{ method: string; verified: boolean; amount: number }>>();
  for (const a of allocations) {
    const p = payById.get(a.payment_id as string);
    const tx = txByObligation.get(a.obligation_id as string);
    if (!p || !tx || p.status !== "confirmed") continue;
    const list = paysBy.get(tx) ?? [];
    list.push({ method: String(p.method), verified: p.verification === "provider_confirmed", amount: Number(p.amount) });
    paysBy.set(tx, list);
  }

  return rows.map((t) => {
    const sale = t.origin_type === "sale" ? saleById.get(t.origin_id as string) : undefined;
    const doc = t.origin_type === "document" ? docById.get(t.origin_id as string) : undefined;
    const pays = (paysBy.get(t.id as string) ?? []).sort((a, b) => b.amount - a.amount);
    const items = linesBy.get(t.id as string) ?? [];
    return {
      id: t.id as string,
      at: t.earned_at as string,
      channel: t.channel as string,
      reference: sale?.receipt_number ?? doc?.number ?? null,
      where: sale?.device_id ? tills.get(sale.device_id) ?? "Till" : null,
      who: people.get((sale?.cashier_membership_id ?? t.actor_membership_id) as string) ?? null,
      items: items.length <= 3 ? items.join(", ") || "Sale" : `${items.slice(0, 2).join(", ")} and ${items.length - 2} more`,
      total: Number(t.total),
      status: String(t.status),
      method: pays[0]?.method ?? null,
      verified: pays.some((p) => p.verified),
      methods: new Set(pays.map((p) => p.method)).size,
    };
  });
}

/** The till's shifts, newest first, or null if they could not be read. */
export async function loadShifts(businessId: string): Promise<ShiftRow[] | null> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("pos_shift")
    .select("id, opened_at, closed_at, status, device_id, cashier_membership_id, expected_cash, declared_cash, cash_difference, difference_note")
    .eq("business_id", businessId)
    .order("opened_at", { ascending: false })
    .limit(60);
  if (error) return null;
  const rows = data ?? [];
  const [people, tills] = await Promise.all([
    names(db, unique(rows.map((s) => s.cashier_membership_id as string | null))),
    deviceLabels(db, unique(rows.map((s) => s.device_id as string | null))),
  ]);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows.map((s) => ({
    id: s.id as string,
    openedAt: s.opened_at as string,
    closedAt: (s.closed_at as string | null) ?? null,
    status: String(s.status),
    till: s.device_id ? tills.get(s.device_id as string) ?? "Till" : null,
    cashier: people.get(s.cashier_membership_id as string) ?? null,
    expected: num(s.expected_cash),
    counted: num(s.declared_cash),
    difference: num(s.cash_difference),
    note: (s.difference_note as string | null) ?? null,
  }));
}
