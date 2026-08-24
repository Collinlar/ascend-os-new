"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { isBareRoute, type NavItem } from "@/lib/nav/routes";

// The workspace bar. A bottom row on a phone, because 77% of the traffic
// here is a thumb on a 375px screen, and a top row once there is width for
// it. Four tabs at most, with the rest behind More: a row of eight targets
// on a small screen is a row nobody can hit.

const MAX_TABS = 4;

export default function NavBar({
  items,
  businessName,
  businessCount = 1,
}: {
  items: NavItem[];
  businessName: string;
  businessCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // The cookie is cleared server side or it is not. Either way the
      // person asked to leave, so take them out of the workspace and let
      // the next request decide what they can see.
    }
    router.push("/");
    router.refresh();
  }

  // The till and the public pages render without this entirely.
  if (isBareRoute(pathname)) return null;
  if (items.length === 0) return null;

  const tabs = items.slice(0, MAX_TABS);
  const rest = items.slice(MAX_TABS);
  const activeInRest = rest.some((i) => pathname.startsWith(i.href));

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <>
      {/* Identity, so a merchant always knows whose books they are looking at */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-2.5">
          <Mark size={22} />
          <span className="truncate text-sm font-semibold text-ink">{businessName}</span>
        </div>
      </div>

      {/* Spacer so the fixed bar never covers the last row of content */}
      <div aria-hidden className="h-[env(safe-area-inset-bottom)] sm:hidden" />

      <nav
        aria-label="Your business"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:static sm:border-b sm:border-t-0"
      >
        <div className="mx-auto flex max-w-2xl">
          {tabs.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`tap flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold sm:flex-row sm:gap-2 sm:py-3 sm:text-sm ${
                isActive(item.href) ? "text-teal-dark" : "text-mid-grey"
              }`}
            >
              <span
                aria-hidden
                className={`h-0.5 w-6 rounded-full sm:hidden ${
                  isActive(item.href) ? "bg-teal" : "bg-transparent"
                }`}
              />
              {item.short}
            </Link>
          ))}

          {/* Permanent. It holds the way out, and a business with four
              destinations used to have no More button at all, which would
              have left sign out unreachable for exactly the people with the
              simplest setup. */}
          <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={`tap flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold sm:flex-row sm:gap-2 sm:py-3 sm:text-sm ${
                activeInRest ? "text-teal-dark" : "text-mid-grey"
              }`}
            >
              <span
                aria-hidden
                className={`h-0.5 w-6 rounded-full sm:hidden ${
                  activeInRest ? "bg-teal" : "bg-transparent"
                }`}
              />
              More
            </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          role="dialog"
          aria-label="More"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="rounded-t-card bg-white px-4 pb-8 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <p className="font-semibold text-ink">Everything else</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="tap px-2 text-sm font-medium text-mid-grey"
              >
                Close
              </button>
            </div>
            {rest.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="tap block rounded-panel px-3 py-3 text-ink hover:bg-light-grey"
              >
                {item.label}
              </Link>
            ))}

            {/* Whose books these are, and how to put them down. On a phone
                that gets handed around a shop, leaving is not a
                convenience. */}
            <div className="mt-2 border-t border-line pt-3">
              <p className="px-3 text-xs font-medium text-mid-grey">
                Signed in to{" "}
                <span className="font-bold text-ink">{businessName}</span>
              </p>
              {businessCount > 1 && (
                <Link
                  href="/switch"
                  onClick={() => setMoreOpen(false)}
                  className="tap mt-1 block rounded-panel px-3 py-3 font-medium text-teal-dark hover:bg-light-grey"
                >
                  Open another business
                </Link>
              )}
              <button
                onClick={signOut}
                disabled={signingOut}
                className="tap mt-1 block w-full rounded-panel px-3 py-3 text-left font-medium text-ink-muted hover:bg-light-grey disabled:opacity-60"
              >
                {signingOut ? "Signing you out..." : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
