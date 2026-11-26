// What a customer can say went wrong with an order (round 2, R5), in the
// design's words. The first five go to the shop first; a problem with the
// shop itself goes to Ascend at once (decision 7).

export const ORDER_ISSUES = [
  { key: "damaged", reason: "damaged", label: "An item arrived damaged", shopFirst: true },
  { key: "missing", reason: "missing", label: "Something is missing", shopFirst: true },
  { key: "wrong", reason: "wrong_item", label: "Wrong item", shopFirst: true },
  { key: "late", reason: "never_arrived", label: "It never arrived", shopFirst: true },
  { key: "return", reason: "return_item", label: "I want to return an item", shopFirst: true },
  { key: "shop", reason: "other", label: "A problem with the shop itself", shopFirst: false },
] as const;

/** How a report on an order reads to the customer and the shop. */
export const ISSUE_BY_REASON: Record<string, string> = {
  damaged: "An item arrived damaged",
  missing: "Something is missing",
  wrong_item: "Wrong item",
  never_arrived: "It never arrived",
  return_item: "A return",
  other: "A problem with the shop itself",
  fake_business: "Not a real business",
};
