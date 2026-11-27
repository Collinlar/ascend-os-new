"use client";

// The private reference a Discover click carries to a business's pages
// (round 3, P1). Kept for this tab only, per shop, for 7 days at most, so
// an order or a booking that follows the click can be counted for the
// promotion that brought the customer. Nothing personal is in it.

const KEY = (slug: string) => `ascend_dref:${slug}`;
const WEEK = 7 * 864e5;

/** Takes ?dref= off the address, keeps it, and returns it if it is new. */
export function takeDiscoverRef(slug: string): string | null {
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("dref");
    if (!ref || !/^[a-f0-9]{32}$/.test(ref)) return null;
    sessionStorage.setItem(KEY(slug), JSON.stringify({ ref, at: Date.now() }));
    url.searchParams.delete("dref");
    window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
    return ref;
  } catch {
    return null;
  }
}

/** The reference for this shop, if a click brought this tab here this week. */
export function discoverRef(slug: string): string | undefined {
  try {
    const raw = sessionStorage.getItem(KEY(slug));
    if (!raw) return undefined;
    const { ref, at } = JSON.parse(raw) as { ref: string; at: number };
    return Date.now() - at < WEEK ? ref : undefined;
  } catch {
    return undefined;
  }
}
