// Taking cash at either till: the notes a customer is likely to hand over,
// and what a keypad press does to the amount typed so far.

export const cents = (n: number) => Math.round(n * 100) / 100;

/** Exact, then the round notes just above the total, smallest first. */
export function likelyNotes(total: number): number[] {
  const out = new Set<number>([cents(total)]);
  for (const step of [5, 10, 20, 50, 100, 200]) {
    const up = Math.ceil(total / step) * step;
    if (up > total) out.add(up);
    if (out.size >= 4) break;
  }
  return Array.from(out)
    .sort((a, b) => a - b)
    .slice(0, 4);
}

export const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/** The amount after one keypad press. Two decimal places at most. */
export function pressKey(amount: string, key: string): string {
  if (key === "back") return amount.slice(0, -1);
  if (key === ".") return amount.includes(".") ? amount : (amount || "0") + ".";
  const [, dec] = amount.split(".");
  if (dec !== undefined && dec.length >= 2) return amount;
  if (amount === "0") return key;
  return (amount + key).slice(0, 9);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function clock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit", hour12: false });
}
