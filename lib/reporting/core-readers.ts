// Phase 2, step 2d: the screens move from the product tables to the
// commerce core (docs/planning/2026-11-foundation-alignment/PHASE_2D_PLAN.md).
//
// COMMERCE_READERS chooses what merchants see:
//   unset or "compare"  today's figures are shown. The core's are worked out
//                       alongside, and any difference is recorded in
//                       commerce_reader_comparison for the review (step 2d.3).
//   "core"              the core's figures are shown (step 2d.4).
//
// Reading the core must never break a screen. If it fails, the screen shows
// today's figures, as it always has, and nothing is recorded.

import { supabaseServer } from "@/lib/supabase";

export type ReadersMode = "compare" | "core";

export function readersMode(): ReadersMode {
  return process.env.COMMERCE_READERS === "core" ? "core" : "compare";
}

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

/** Spent and owed per customer, from the core. */
export async function coreCustomerMoney(
  businessId: string
): Promise<Map<string, { spent: number; owed: number }> | null> {
  try {
    const { data, error } = await supabaseServer().rpc("commerce_customer_money", {
      p_business: businessId,
    });
    if (error || !Array.isArray(data)) return null;
    return new Map(
      data.map((r: { customer_id: string; spent: number; owed: number }) => [
        r.customer_id,
        { spent: Number(r.spent), owed: Number(r.owed) },
      ])
    );
  } catch {
    return null;
  }
}

/**
 * Records each figure where today's value and the core's differ. Totals
 * only, never per customer. Best effort: a failed write is ignored.
 */
export async function recordDifferences(
  businessId: string,
  screen: "dashboard" | "customers",
  day: string,
  figures: Array<{ figure: string; current: number | null; core: number | null }>
): Promise<void> {
  const db = supabaseServer();
  const differing = figures.filter(
    (f) => Math.round((f.current ?? 0) * 100) !== Math.round((f.core ?? 0) * 100)
  );
  await Promise.allSettled(
    differing.map((f) =>
      db.rpc("commerce_record_comparison", {
        p_business: businessId,
        p_screen: screen,
        p_figure: f.figure,
        p_day: day,
        p_current: f.current ?? 0,
        p_core: f.core ?? 0,
      })
    )
  );
}
