"use client";

import { formatGHS } from "@/lib/money";

export interface DiscoverRow {
  listing_id: string;
  business_id: string;
  business_name: string;
  item_id: string | null;
  item_name: string | null;
  price: number | null;
  city: string | null;
  category: string | null;
  promoted: boolean;
  campaign_id: string | null;
  shop_slug?: string | null;
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
      <p className="py-16 text-center text-mid-grey">
        Nothing found. Try a different word, or leave the city empty.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {results.map((row) => {
        const href = row.shop_slug ? `/s/${row.shop_slug}` : "#";
        return (
          <button
            key={`${row.listing_id}-${row.promoted}`}
            onClick={() => go(row, href)}
            className="tap block w-full border border-line px-4 py-4 text-left transition-colors hover:border-teal"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-ink">
                {row.item_name ?? row.business_name}
              </span>
              {row.price !== null && (
                <span className="font-semibold text-ink">
                  {formatGHS(Number(row.price))}
                </span>
              )}
            </span>
            <span className="mt-1 block text-sm text-mid-grey">
              {row.business_name}
              {row.city && ` · ${row.city}`}
            </span>

            {/* Paid placement is labelled plainly, and says what it is not.
                It must never read as a recommendation or a trust signal. */}
            {row.promoted && (
              <span className="mt-2 inline-block bg-light-grey px-2 py-1 text-xs text-mid-grey">
                Paid placement · this business paid to appear here, it is not a
                recommendation
              </span>
            )}
          </button>
        );
      })}

      <p className="pt-6 text-center text-xs text-mid-grey">
        Each business sets its own prices, stock and delivery, and handles its
        own customer service. AscendSME does not sell these items.
      </p>
    </div>
  );
}
