import "server-only";

// The Money page (v3 design, D3), read from the Financial Foundation:
// cash_position (0102) for the five figures kept apart, the money movements
// themselves (financial_event, cash basis), and what customers owe
// (receivables_aging). Reads only. No profit figure, and no grand total
// (FINANCIAL_FOUNDATION_PLAN.md decision 6).

import { supabaseServer } from "@/lib/supabase";

export interface CashPosition {
  from: string;
  to: string;
  recorded: { cashIn: number; otherDeclaredIn: number; cashRefunds: number; tillPaidOuts: number; netCash: number };
  verified: { received: number; refunded: number; reversed: number; fees: number; net: number };
  pending: { amount: number; payments: number };
  receivables: { outstanding: number; overdue: number; count: number };
  expenses: { total: number; byCategory: Record<string, number> };
  notes: string[];
}

export interface MoneyMovement {
  id: string;
  at: string;
  kind: string;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  verification: string;
  category: string | null;
  customerName: string | null;
}

export interface OwedRow {
  id: string;
  customer: string | null;
  document: string | null;
  origin: string;
  outstanding: number;
  dueDate: string | null;
  daysOverdue: number | null;
  bucket: string;
}

const n = (v: unknown) => Number(v ?? 0);

export async function loadCashPosition(businessId: string, from: string, to: string): Promise<CashPosition | null> {
  const { data, error } = await supabaseServer().rpc("cash_position", { p_business: businessId, p_from: from, p_to: to });
  if (error || !data) return null;
  const c = data as {
    period: { from: string; to: string };
    recorded: Record<string, number>;
    verified: Record<string, number>;
    pending_settlement: { amount: number; payments: number };
    receivables: { outstanding: number; overdue: number; count: number };
    expenses: { total: number; by_category: Record<string, number> };
    notes: Array<{ say: string }>;
  };
  return {
    from: c.period.from,
    to: c.period.to,
    recorded: {
      cashIn: n(c.recorded.cash_in),
      otherDeclaredIn: n(c.recorded.other_declared_in),
      cashRefunds: n(c.recorded.cash_refunds),
      tillPaidOuts: n(c.recorded.till_paid_outs),
      netCash: n(c.recorded.net_cash),
    },
    verified: {
      received: n(c.verified.received),
      refunded: n(c.verified.refunded),
      reversed: n(c.verified.reversed),
      fees: n(c.verified.fees),
      net: n(c.verified.net),
    },
    pending: { amount: n(c.pending_settlement.amount), payments: n(c.pending_settlement.payments) },
    receivables: { outstanding: n(c.receivables.outstanding), overdue: n(c.receivables.overdue), count: n(c.receivables.count) },
    expenses: { total: n(c.expenses.total), byCategory: c.expenses.by_category ?? {} },
    notes: (c.notes ?? []).map((x) => x.say).filter(Boolean),
  };
}

export const MOVEMENTS_LIMIT = 100;

/** Money that moved (cash basis), newest first, within the period. */
export async function loadMovements(businessId: string, from: string, to: string): Promise<MoneyMovement[] | null> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("financial_event")
    .select("id, occurred_at, kind, direction, amount, method, verification, category, customer_id")
    .eq("business_id", businessId)
    .eq("basis", "cash")
    .gte("occurred_at", `${from}T00:00:00Z`)
    .lt("occurred_at", `${nextDay(to)}T00:00:00Z`)
    .order("occurred_at", { ascending: false })
    .limit(MOVEMENTS_LIMIT);
  if (error) return null;
  const rows = data ?? [];
  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id as string | null).filter((x): x is string => !!x)));
  const customers = customerIds.length
    ? (await db.from("customer").select("id, display_name").in("id", customerIds)).data ?? []
    : [];
  const nameOf = new Map(customers.map((c) => [c.id as string, c.display_name as string]));
  return rows.map((r) => ({
    id: r.id as string,
    at: r.occurred_at as string,
    kind: r.kind as string,
    direction: r.direction as "in" | "out",
    amount: n(r.amount),
    method: (r.method as string | null) ?? null,
    verification: String(r.verification),
    category: (r.category as string | null) ?? null,
    customerName: r.customer_id ? nameOf.get(r.customer_id as string) ?? null : null,
  }));
}

/** What customers owe, most overdue first. */
export async function loadOwed(businessId: string): Promise<OwedRow[] | null> {
  const { data, error } = await supabaseServer().rpc("receivables_aging", { p_business: businessId });
  if (error) return null;
  return ((data ?? []) as Array<{
    obligation_id: string;
    customer_name: string | null;
    document_number: string | null;
    origin_type: string;
    outstanding: number;
    due_date: string | null;
    days_overdue: number | null;
    bucket: string;
  }>)
    .map((r) => ({
      id: r.obligation_id,
      customer: r.customer_name,
      document: r.document_number,
      origin: r.origin_type,
      outstanding: n(r.outstanding),
      dueDate: r.due_date,
      daysOverdue: r.days_overdue,
      bucket: r.bucket,
    }))
    .sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) || b.outstanding - a.outstanding);
}

/** Category keys to the words the business reads (standard list and its own). */
export async function loadCategoryLabels(businessId: string): Promise<Map<string, string>> {
  const { data } = await supabaseServer()
    .from("financial_category")
    .select("key, label, business_id")
    .or(`business_id.is.null,business_id.eq.${businessId}`);
  return new Map((data ?? []).map((c) => [c.key as string, c.label as string]));
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const KIND_LABEL: Record<string, string> = {
  money_received: "Money in",
  payment_reversed: "Payment reversed",
  refund_paid: "Refund paid",
  expense: "Expense",
  till_expense: "Paid out from the till",
  provider_fee: "Provider fee",
  settlement_received: "Paid out to your account",
};
