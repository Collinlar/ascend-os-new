// Client safe navigation facts.
//
// Deliberately free of server imports. The nav bar is a client component,
// and pulling these from the workspace resolver dragged next/headers into
// the browser bundle, which TypeScript cannot see because the client and
// server boundary is not part of the type system.

export interface NavItem {
  href: string;
  label: string;
  /** Short enough for a tab under an icon on a 375px screen. */
  short: string;
}

// Surfaces that must not carry the workspace nav: the till runs full screen
// on a counter, onboarding is a funnel, and the public pages belong to the
// merchant's customers rather than to the merchant.
const BARE_PREFIXES = [
  "/pos",
  "/onboarding",
  "/offline",
  "/b/",
  "/s/",
  "/d/",
  "/partner/",
  "/booked/",
];

export function isBareRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
