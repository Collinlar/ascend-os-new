// The words an order goes to a supplier in, on WhatsApp (Advanced
// Inventory A2). Plain and short, the way a shop owner would type it.

export function orderMessage(o: {
  businessName: string;
  number: string;
  place: string;
  expectedOn: string | null;
  lines: { item: string; quantity: number }[];
}): string {
  const when = o.expectedOn
    ? new Date(o.expectedOn + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : null;
  return [
    `Hello, this is ${o.businessName}. Our order ${o.number}:`,
    ...o.lines.map((l) => `${l.quantity} x ${l.item}`),
    `Deliver to ${o.place}${when ? ` by ${when}` : ""}.`,
    "Thank you.",
  ].join("\n");
}

/** wa.me wants the number without the plus. */
export function whatsappLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
}
