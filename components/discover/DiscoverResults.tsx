"use client";

import { useState } from "react";
import { formatGHS } from "@/lib/money";
import { TILE_TINTS } from "@/lib/brand/tints";
import ReportProblem from "@/components/risk/ReportProblem";

// Discover results, on the v3 Discover design.
//
// Two rules shape this more than the layout does. Paid placement is
// labelled and says what it is not (DSC-002, PRI-006), and the merchant,
// not Ascend, is the seller (DSC-006). Both are stated on the page rather
// than buried in terms nobody opens. A sponsored result explains itself in
// place ("Why am I seeing this?"), with the way to report the business.

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

function tintFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n + seed.charCodeAt(i)) % 997;
  return TILE_TINTS[n % TILE_TINTS.length];
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

// The click is recorded, then the customer goes where they chose. A failure
// to record must never stand between them and the business.
async function go(row: DiscoverRow, href: string) {
  let target = href;
  try {
    const res = await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: row.listing_id, campaignId: row.campaign_id }),
      keepalive: true,
    });
    // The click's reference goes with the customer to the shop, so an
    // order that follows can be counted for the promotion (round 3, P1).
    const out = (await res.json().catch(() => null)) as { ref?: string } | null;
    if (out?.ref && href.startsWith("/s/")) target = `${href}?dref=${out.ref}`;
  } catch {
    // Ignored on purpose.
  }
  window.location.href = target;
}

function Thumb({ row, size }: { row: DiscoverRow; size: string }) {
  const label = row.item_name ?? row.business_name;
  const tint = tintFor(row.listing_id);
  return (
    <span
      style={row.photo_url ? undefined : { backgroundColor: tint.bg, color: tint.ink }}
      className={`flex flex-none items-center justify-center overflow-hidden rounded-[14px] bg-neutral-50 ${size}`}
    >
      {row.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.photo_url} alt={label} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="mono text-[18px] font-medium opacity-50">
          {initials(label)}
        </span>
      )}
    </span>
  );
}

/** One result as a row: picture, what it is, who sells it, the price. */
export function ResultRow({ row }: { row: DiscoverRow }) {
  const [why, setWhy] = useState(false);
  const href = row.shop_slug ? `/s/${row.shop_slug}` : "#";
  return (
    <div className="border-t border-neutral-100">
      <button onClick={() => go(row, href)} className="tap flex w-full gap-4 py-3.5 text-left hover:bg-neutral-50">
        <Thumb row={row} size="h-20 w-20 sm:h-24 sm:w-24" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {row.promoted && (
            <span className="self-start rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-bold text-neutral-700">Sponsored</span>
          )}
          <span className="text-[15.5px] font-bold leading-snug text-ink">{row.item_name ?? row.business_name}</span>
          <span className="truncate text-[13.5px] text-neutral-600">
            {row.item_name ? row.business_name : "Shop"}
            {row.city ? ` · ${row.city}` : ""}
          </span>
          {row.category_label && <span className="text-[12.5px] text-neutral-500">{row.category_label}</span>}
        </span>
        {row.price !== null && (
          <span className="num flex-none font-heading text-[17px] font-extrabold text-ink-heading">{formatGHS(Number(row.price))}</span>
        )}
      </button>
      {row.promoted && (
        <div className="pb-3">
          <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="tap flex items-center text-[13px] font-semibold text-teal-700">
            Why am I seeing this?
          </button>
          {why && (
            <div className="mt-1 rounded-card bg-neutral-50 p-4 text-[13.5px] leading-relaxed text-neutral-700">
              <p>
                <strong className="text-ink">{row.business_name}</strong> paid to show
                {row.item_name ? ` ${row.item_name}` : " their shop"} to people looking on Discover
                {row.city ? ` near ${row.city}` : ""}.
              </p>
              <p className="mt-1.5">Paying for placement never makes a listing more trustworthy, and Ascend does not check it any differently.</p>
              {row.shop_slug && (
                <div className="mt-2">
                  <ReportProblem source="shop" slug={row.shop_slug} businessName={row.business_name} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A shop as a card: its first picture, its name, what it sells, where. */
export function ShopCard({ row, count, categories }: { row: DiscoverRow; count: number; categories: string[] }) {
  const href = row.shop_slug ? `/s/${row.shop_slug}` : "#";
  const tint = tintFor(row.business_id);
  return (
    <button onClick={() => go(row, href)} className="tap flex flex-col gap-2.5 text-left hover:opacity-90">
      <span
        style={row.photo_url ? undefined : { backgroundColor: tint.bg, color: tint.ink }}
        className="flex h-[170px] w-full items-center justify-center overflow-hidden rounded-[20px] bg-neutral-50"
      >
        {row.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photo_url} alt={row.business_name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="mono text-[24px] font-medium opacity-50">
            {initials(row.business_name)}
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[16px] font-bold text-ink">{row.business_name}</span>
        <span className="text-[13.5px] text-neutral-600">
          {[categories.slice(0, 2).join(", "), `${count} thing${count === 1 ? "" : "s"} on Discover`].filter(Boolean).join(" · ")}
        </span>
        {row.city && <span className="text-[13px] text-neutral-500">{row.city}</span>}
      </span>
    </button>
  );
}

export function SellerNote({ anyPromoted }: { anyPromoted: boolean }) {
  return (
    <div className="mt-6 flex flex-col gap-2 rounded-card bg-neutral-50 px-4 py-3.5 text-[13px] leading-relaxed text-neutral-600">
      {anyPromoted && (
        <p>
          <strong className="text-ink">Sponsored</strong> means the business paid to appear higher. It is not a recommendation, and it says nothing
          about whether they are any good.
        </p>
      )}
      <p>Each business sets its own prices, stock and delivery, and looks after its own customers. You buy from them directly; Ascend does not sell these items.</p>
    </div>
  );
}
