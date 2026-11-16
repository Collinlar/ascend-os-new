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
