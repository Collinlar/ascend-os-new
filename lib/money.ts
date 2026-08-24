// GHS-first money handling. Local currency is the default for all Ghanaian
// audience surfaces (MKT-002, ENT-001). Amounts are handled as strings or
// integers of pesewas at boundaries; display formatting lives here.

export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

// Shelf prices, for a customer scanning a grid rather than a merchant
// reading down a column. Whole cedis drop the decimals, which carry no
// information on a price tag and cost two characters of a small tile.
export function formatShelfGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

// Change due on a cash payment (POS-PAY-002).
export function changeDue(tendered: number, total: number): number {
  return Math.max(0, Math.round((tendered - total) * 100) / 100);
}
