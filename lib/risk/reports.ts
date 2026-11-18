// Customer reports (Risk and Trust R4, migration 0114).
//
// What a customer can tell Ascend about a business, in their words, and
// where they told us from. The keys are the database's reasons; the labels
// are what the customer reads on the page.

export const REPORT_REASONS = [
  { key: "not_delivered", label: "I paid and nothing came" },
  { key: "wrong_amount", label: "I was charged more than we agreed" },
  { key: "refund_refused", label: "A refund was promised and never paid" },
  { key: "fake_business", label: "I don't think this is a real business" },
  { key: "unwanted_messages", label: "They keep messaging me when I asked them not to" },
  { key: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

export const REPORT_SOURCES = ["invoice", "shop", "booking"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

/** How the desk names a reason (matches customer_report_label in 0114). */
export const REASON_FOR_DESK: Record<string, string> = {
  not_delivered: "Paid and nothing came",
  wrong_amount: "Charged more than agreed",
  refund_refused: "Refund not paid",
  fake_business: "Not a real business",
  unwanted_messages: "Unwanted messages",
  other: "Something else",
};

export const SOURCE_FOR_DESK: Record<string, string> = {
  invoice: "from an invoice or receipt",
  shop: "from the shop page",
  booking: "from the booking page",
};

/** The anonymous cookie that lets us count one phone's reports. */
export const REPORTER_COOKIE = "ascend_rk";
