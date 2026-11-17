// The dashboard's money figures from the commerce core (Phase 2).
//
// Since step 2d.5 this is the only source: the old reads of sale, shop_order,
// payment and receivable are gone, and so is compare mode. If the core
// cannot be read, the dashboard says so rather than showing other figures.
// The customers list takes its money from business_customers(), which reads
// the core since 0090.

import { supabaseServer } from "@/lib/supabase";

export interface CoreDashboardFigures {
  salesToday: number;
  saleCount: number;
  receivedToday: number;
  verifiedReceived: number;
  owed: number;
  owedCustomers: number;
  overdueCount: number;
  overdueAmount: number;
  oldestOwedDays: number | null;
}

export async function coreDashboardFigures(
  businessId: string,
  day: string
): Promise<CoreDashboardFigures | null> {
  try {
    const { data, error } = await supabaseServer().rpc("commerce_dashboard_figures", {
      p_business: businessId,
      p_day: day,
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) return null;
    return {
      salesToday: Number(row.sales_today),
      saleCount: Number(row.sale_count),
      receivedToday: Number(row.received_today),
      verifiedReceived: Number(row.verified_received),
      owed: Number(row.owed),
      owedCustomers: Number(row.owed_customers),
      overdueCount: Number(row.overdue_count),
      overdueAmount: Number(row.overdue_amount),
      oldestOwedDays: row.oldest_owed_days === null ? null : Number(row.oldest_owed_days),
    };
  } catch {
    return null;
  }
}

/**
 * Where the money paid online has got to (0092): what is still with the
 * payment provider on its way to the merchant, and what was paid out to the
 * merchant today. Cash and money sent straight to the merchant are in hand
 * already and are not counted here.
 */
export interface CoreSettlementFigures {
  onItsWay: number;
  onItsWayCount: number;
  paidOutToday: number;
}

export async function coreSettlementFigures(
  businessId: string,
  day: string
): Promise<CoreSettlementFigures | null> {
  try {
    const { data, error } = await supabaseServer()
      .from("payment_settlement")
      .select("state, amount, settled_at")
      .eq("business_id", businessId)
      .in("state", ["awaiting", "settled"]);
    if (error || !data) return null;
    const round = (n: number) => Math.round(n * 100) / 100;
    const waiting = data.filter((r) => r.state === "awaiting");
    const today = data.filter(
      (r) => r.state === "settled" && typeof r.settled_at === "string" && r.settled_at.slice(0, 10) === day
    );
    return {
      onItsWay: round(waiting.reduce((n, r) => n + Number(r.amount), 0)),
      onItsWayCount: waiting.length,
      paidOutToday: round(today.reduce((n, r) => n + Number(r.amount), 0)),
    };
  } catch {
    return null;
  }
}
