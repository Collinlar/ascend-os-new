"use client";

import { formatGHS } from "@/lib/money";

// Discover results, built on the Ascend Discover design.
//
// Two rules shape this more than the layout does. Paid placement is
// labelled and says what it is not (DSC-002, PRI-006), and the merchant,
// not Ascend, is the seller (DSC-006). Both are stated on the page rather
// than buried in terms nobody opens.

export interface DiscoverRow {
  listing_id: string;
  business_id: string;
  business_name: string;
  item_id: string | null;
  item_name: string | null;
  price: number | null;
  photo_url: string | null;
  city: string | null;
  category: string | null;
  category_label: string | null;
  promoted: boolean;
  campaign_id: string | null;
  shop_slug?: string | null;
}

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

function initials(name: string, max = 2) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, max)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters || name.slice(0, 1).toUpperCase();
}

export default function DiscoverResults({ results }: { results: DiscoverRow[] }) {
  // The click is recorded, then the customer goes where they chose. A
  // failure to record must never stand between them and the business.
  async function go(row: DiscoverRow, href: string) {
    try {
      await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: row.listing_id,
          campaignId: row.campaign_id,
        }),
        keepalive: true,
      });
    } catch {
      // Ignored on purpose.
    }
    window.location.href = href;
  }

  if (results.length === 0) {
    return (
      <div className="rounded-[18px] border border-line bg-white px-6 py-14 text-center">
        <p className="text-base font-bold text-ink">Nothing here yet.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-ink-muted">
          Try a different word, or leave the city empty to look everywhere.
        </p>
      </div>
    );
  }

  const anyPromoted = results.some((r) => r.promoted);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((row) => {
          const href = row.shop_slug ? `/s/${row.shop_slug}` : "#";
          const label = row.item_name ?? row.business_name;
          const tint = tintFor(row.listing_id);

          return (
            <button
              key={`${row.listing_id}-${row.promoted}`}
              onClick={() => go(row, href)}
              className="tap flex flex-col overflow-hidden rounded-panel border border-line bg-white text-left shadow-card"
            >
              {/* The photograph is the whole point of a browsing page, so
                  it gets shown whenever there is one. The tinted initials
                  are the fallback, not the design. */}
              <span
                style={row.photo_url ? undefined : { backgroundColor: tint.bg, color: tint.ink }}
                className="relative flex aspect-square w-full items-center justify-center bg-light-grey"
              >
                {row.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photo_url}
                    alt={label}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden className="mono text-[19px] font-medium opacity-40">
                    {initials(label)}
                  </span>
                )}
                {row.promoted && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-0.5 text-[10.5px] font-extrabold text-ink-muted">
                    Sponsored
                  </span>
                )}
              </span>

              <span className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
                <span className="text-[13.5px] font-bold leading-snug tracking-[-0.01em] text-ink">
                  {label}
                </span>
                {row.price !== null && (
                  <span className="num mt-0.5 text-[13.5px] font-extrabold text-teal-dark">
                    {formatGHS(Number(row.price))}
                  </span>
                )}
                <span className="mt-1.5 text-[11.5px] font-medium text-ink-muted">
                  {row.item_name ? row.business_name : "Shop"}
                  {row.city && ` · ${row.city}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Said once, plainly, and only when there is something to explain.
          A label a customer cannot interpret is not a disclosure. */}
      {anyPromoted && (
        <p className="mt-6 rounded-panel border border-line bg-surface px-4 py-3.5 text-[12.5px] font-medium text-ink-muted">
          <span className="font-bold text-ink">Sponsored</span> means the
          business paid to appear higher. It is not a recommendation, and it
          says nothing about whether they are any good.
        </p>
      )}

      <p className="mt-3 text-center text-xs font-medium text-ink-muted">
        Each business sets its own prices, stock and delivery, and handles its
        own customer service. AscendSME does not sell these items.
      </p>
    </div>
  );
}
