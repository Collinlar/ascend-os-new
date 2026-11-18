// Category tints for the selling grid, from the v3 design's soft tiles.
//
// A cashier under pressure finds an item by shape and colour before they
// read the label, so each category carries a consistent tint and every tile
// shows a monogram where a product photo has not been added yet. This is
// what makes a dense grid scannable rather than a wall of text.

const TINTS: Record<string, [background: string, ink: string]> = {
  Drinks: ["#E6F1FB", "#185FA5"],
  Snacks: ["#FEF3E2", "#633806"],
  Household: ["#EEF0FF", "#4338CA"],
  "Personal Care": ["#FEECEC", "#B91C1C"],
  Groceries: ["#DCFCE7", "#166534"],
  Stationery: ["#FFE7D1", "#8A3B00"],
  Services: ["#EEFCF9", "#006B62"],
};

const FALLBACK: [string, string] = ["#F3F4F6", "#374151"];

export function categoryTint(category?: string | null): [string, string] {
  if (!category) return FALLBACK;
  return TINTS[category] ?? FALLBACK;
}

// Initials for a product with no photo.
//
// Only words that begin with a letter count. Real catalogues are full of
// sizes and brackets — "Milo 400g", "Gari (olonka)", "Coca-Cola 50cl" — and
// naively taking the first character of the first two words yields "M4",
// "G(" and "C5", which read as noise rather than as the product. A single
// usable word falls back to its first two letters.
export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^[a-zA-Z]/.test(word));

  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase() || "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// A faint diagonal weave so an image-less tile still reads as a surface
// rather than a flat block of colour.
export function tileSurface(category?: string | null): React.CSSProperties {
  const [background] = categoryTint(category);
  return {
    backgroundColor: background,
    backgroundImage:
      "repeating-linear-gradient(135deg, rgba(0,0,0,.045) 0, rgba(0,0,0,.045) 1.5px, transparent 1.5px, transparent 11px)",
  };
}

// Stock urgency drives the colour of the count on a tile, so a cashier sees
// "nearly out" without reading the number.
export function stockTone(
  stock: number | undefined,
  threshold = 8
): "none" | "low" | "out" {
  if (stock === undefined) return "none";
  if (stock <= 0) return "out";
  if (stock <= threshold) return "low";
  return "none";
}
