// Category tints for the selling grid, from the design identity.
//
// A cashier under pressure finds an item by shape and colour before they
// read the label, so each category carries a consistent tint and every tile
// shows a monogram where a product photo has not been added yet. This is
// what makes a dense grid scannable rather than a wall of text.

const TINTS: Record<string, [background: string, ink: string]> = {
  Drinks: ["#E1F1EE", "#0B6F65"],
  Snacks: ["#F9EFD7", "#9A6A11"],
  Household: ["#E7EEF6", "#3F6494"],
  "Personal Care": ["#F0EAF6", "#6B4F8F"],
  Groceries: ["#E7F1E9", "#3B7A4E"],
  Stationery: ["#F2ECE5", "#8A6A45"],
  Services: ["#E6F4F1", "#0B6F65"],
};

const FALLBACK: [string, string] = ["#EDF2F6", "#43607A"];

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
