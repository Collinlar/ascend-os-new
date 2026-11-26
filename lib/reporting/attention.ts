// What is waiting on the owner, said once for every place that shows it.
//
// Home lists it as "Needs attention"; the top bar's bell counts it on every
// module page (Modules M1). Both read this, so the bell never knows about
// something Home does not, or the other way round.

import { loadDashboard, type AttentionItem } from "@/lib/reporting/dashboard";
import { loadHomeFigures } from "@/lib/reporting/home";
import { expirySummary, type ExpirySummary } from "@/lib/domains/inventory";
import { formatGHS } from "@/lib/money";
import type { AttentionRow } from "@/components/shell/AttentionList";
import type { IconName } from "@/components/shell/icons";

const ICON: Record<string, IconName> = {
  "pending-orders": "inbox",
  overdue: "file",
  unsynced: "device",
  "no-balance": "money",
};

export function toAttentionRows(
  items: AttentionItem[],
  stockOut: number,
  expiry: ExpirySummary | null
): AttentionRow[] {
  const rows: AttentionRow[] = items.map((item) => ({
    id: item.id,
    title: item.label,
    action: item.action,
    href: item.href,
    tone: item.tone,
    icon: ICON[item.id] ?? "alert",
  }));
  if (stockOut > 0) {
    rows.push({
      id: "out-of-stock",
      title: `${stockOut} product${stockOut === 1 ? " is" : "s are"} out of stock`,
      action: "See what is out",
      href: "/inventory?show=out",
      tone: "gold",
      icon: "box",
    });
  }
  if (expiry && expiry.expiredBatches > 0) {
    rows.push({
      id: "expired-stock",
      title: `Expired stock on the shelf: ${formatGHS(expiry.expiredValue)}`,
      action: "See what expired",
      href: "/inventory?tab=expiry",
      tone: "red",
      icon: "box",
    });
  }
  return rows;
}

export function accraDay(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
}

/** Everything waiting on this person in the business they have open. */
export async function loadAttention(
  personId: string,
  businessId: string,
  capabilities: Set<string>
): Promise<AttentionRow[] | null> {
  const [data, figures, expiry] = await Promise.all([
    loadDashboard(personId).catch(() => null),
    loadHomeFigures(businessId, accraDay()).catch(() => null),
    capabilities.has("inventory.expiry") ? expirySummary(businessId).catch(() => null) : Promise.resolve(null),
  ]);
  if (!data) return null;
  return toAttentionRows(data.attention, figures?.stock.out ?? 0, expiry);
}
