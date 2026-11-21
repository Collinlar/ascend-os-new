// What the till does when a counted product runs out (Inventory Core I2,
// decision 4). Pure, so both layouts and the scanner ask the same question.
//
// none  keep selling (the default). A market trader must never be stopped
//       mid-queue by a figure they have not kept up to date.
// soft  sell, and say so, so the cashier can tell the owner.
// hard  refuse while online. Offline the sale is always accepted and the
//       server sees it went below zero; a till that cannot reach the office
//       cannot be sure its own figure is right.

import type { LocalItem } from "./db";

export type StockRule = "none" | "soft" | "hard";

export type StockCheck =
  | { ok: true; note?: string }
  | { ok: false; note: string };

export function stockCheck(item: LocalItem, alreadyInSale: number, wanted: number, online: boolean): StockCheck {
  if (!item.trackStock || item.localStock === undefined) return { ok: true };
  const total = alreadyInSale + wanted;
  if (total <= item.localStock) return { ok: true };
  const rule: StockRule = item.stockRule ?? "none";
  const left = Math.max(0, item.localStock);
  if (rule === "none") return { ok: true };
  const record = left === 0 ? `Ascend shows none left of ${item.name}` : `This sale has more ${item.name} than the ${left} Ascend shows left`;
  if (rule === "hard" && online) {
    return {
      ok: false,
      note: `${record}, and the owner has set it to stop at zero. If you can see more on the shelf, ask them to receive it in Inventory.`,
    };
  }
  if (rule === "hard") {
    return { ok: true, note: `${record}. Sold while offline: the office will see it went below zero.` };
  }
  return { ok: true, note: `${record}. Sold anyway. Tell the owner so they can count the shelf.` };
}
