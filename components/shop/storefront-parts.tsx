"use client";

// The pieces every storefront screen shares.
//
// A customer sees exactly one page of this shop, usually opened from a
// WhatsApp link on a phone they are holding in a queue somewhere. Photos,
// prices and the identity strip have to behave the same on every screen of
// the flow or it stops reading as one shop.

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  image: string | null;
}

// Deterministic tint for a product with no photo, so the same item is the
// same colour every time rather than flickering between reloads. Six soft
// grounds pulled from the design, none of them competing with the price.
const TINTS = [
  { bg: "#F0EAF6", ink: "#6B4F8F" },
  { bg: "#E4F0EC", ink: "#0B6F65" },
  { bg: "#FBEFD8", ink: "#9A6207" },
  { bg: "#E7EEF6", ink: "#3F6494" },
  { bg: "#FBECE8", ink: "#B0453A" },
  { bg: "#EEF3F7", ink: "#33506A" },
];

function tintFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n + seed.charCodeAt(i)) % 997;
  return TINTS[n % TINTS.length];
}

// Initials for a product with no photo. Only words that begin with a letter
// count, so "Milo 400g" reads M and "Gari (olonka)" reads G rather than
// picking up a digit or a bracket.
export function initials(name: string, max = 2): string {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, max)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters || name.slice(0, 1).toUpperCase();
}

export function Photo({
  product,
  className = "",
  rounded = "rounded-panel",
  sizeHint,
  monogram = "text-3xl",
}: {
  product: StorefrontProduct;
  className?: string;
  rounded?: string;
  /** Roughly how wide this renders, so the browser fetches once. */
  sizeHint?: string;
  /** Initials scale with the frame: a thumbnail and a hero are not the
      same picture, and one fixed size is wrong in both. */
  monogram?: string;
}) {
  const tint = tintFor(product.id);

  if (product.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        decoding="async"
        sizes={sizeHint}
        className={`${rounded} h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{ backgroundColor: tint.bg, color: tint.ink }}
      className={`${rounded} flex h-full w-full items-center justify-center ${className}`}
    >
      {/* Full strength. Faded initials on a pale tint read as a broken
          image rather than a deliberate stand in for one. */}
      <span className={`mono font-semibold ${monogram}`}>
        {initials(product.name)}
      </span>
    </div>
  );
}

// Quantity control. Two 44px targets either side of a number that does not
// jump width as it changes.
export function Stepper({
  quantity,
  onChange,
  label,
  tone = "light",
}: {
  quantity: number;
  onChange: (next: number) => void;
  /** Names the product, so a screen reader hears which one is changing. */
  label: string;
  tone?: "light" | "plain";
}) {
  const shell =
    tone === "light"
      ? "bg-light-grey"
      : "border border-line bg-white";
  return (
    <div className={`flex items-center gap-0.5 rounded-control p-1 ${shell}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, quantity - 1))}
        aria-label={`One less ${label}`}
        className="tap flex h-10 w-10 items-center justify-center rounded-chip bg-white text-xl font-medium text-ink-soft"
      >
        &minus;
      </button>
      <span className="num min-w-[28px] text-center text-[15px] font-bold text-ink">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        aria-label={`One more ${label}`}
        className="tap flex h-10 w-10 items-center justify-center rounded-chip bg-white text-xl font-medium text-ink-soft"
      >
        +
      </button>
    </div>
  );
}

// Back control, repeated on every screen below the store home.
export function BackButton({
  onClick,
  label,
  floating = false,
}: {
  onClick: () => void;
  label: string;
  floating?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        floating
          ? "tap absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-control bg-white/90 shadow-card backdrop-blur"
          : "tap flex h-11 w-11 flex-none items-center justify-center rounded-control border border-line bg-surface"
      }
    >
      <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
        <polyline
          points="7.5,1 1,7.5 7.5,14"
          stroke="#33506A"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
