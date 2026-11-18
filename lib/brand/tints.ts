// The soft tile colours (v3 design): a light surface and the ink that reads
// on it at 4.5:1 or better. Used where something needs a colour of its own
// without meaning anything by it: a product with no photo, a provider's
// row in the week, a business's initials on Discover.
//
// Kept in one place so the shop, bookings and Discover cannot drift apart.
// The order matters: callers pick by index, so a product keeps its colour.

export interface Tint {
  bg: string;
  ink: string;
}

export const TINT = {
  indigo: { bg: "#EEF0FF", ink: "#4338CA" },
  teal: { bg: "#EEFCF9", ink: "#006B62" },
  gold: { bg: "#FEF3E2", ink: "#633806" },
  blue: { bg: "#E6F1FB", ink: "#185FA5" },
  red: { bg: "#FEECEC", ink: "#B91C1C" },
  grey: { bg: "#F3F4F6", ink: "#374151" },
} satisfies Record<string, Tint>;

/** Six tiles, for anything that cycles through colours by a stable number. */
export const TILE_TINTS: Tint[] = [TINT.indigo, TINT.teal, TINT.gold, TINT.blue, TINT.red, TINT.grey];

/** Five, for providers in a week: teal first, and no grey. */
export const PROVIDER_TINTS: Tint[] = [TINT.teal, TINT.blue, TINT.indigo, TINT.gold, TINT.red];
