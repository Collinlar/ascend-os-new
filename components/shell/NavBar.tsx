"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isBareRoute, type NavItem } from "@/lib/nav/routes";

// The workspace shell.
//
// Two shapes of the same thing. On a phone it is a bottom row under a
// thumb, because 77% of the traffic here is a 375px screen. On a desktop
// it is the Business Web app bar from the design: identity on the left,
// account on the right, and a row of tabs with the open one underlined.
//
// One component rather than two, because the tabs, the badges and the
// account menu all have to agree about what is open and who is signed in.

const MAX_TABS = 4;

export interface NavBadge {
  href: string;
  count: number;
}

export default function NavBar({
  items,
  businessName,
  locationName,
  personName,
  businessCount = 1,
  badges = [],
}: {
  items: NavItem[];
  businessName: string;
  locationName?: string | null;
  personName?: string;
  businessCount?: number;
  /** Counts shown against a tab, for work that is waiting. */
  badges?: NavBadge[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const account = useRef<HTMLDivElement>(null);

  // A menu that will not close is worse than no menu.
  useEffect(() => {
    if (!accountOpen) return;
    function away(e: MouseEvent) {
      if (!account.current?.contains(e.target as Node)) setAccountOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [accountOpen]);

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

  if (isBareRoute(pathname)) return null;
  if (items.length === 0) return null;

  const tabs = items.slice(0, MAX_TABS);
  const rest = items.slice(MAX_TABS);
  const activeInRest = rest.some((i) => pathname.startsWith(i.href));

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const badgeFor = (href: string) =>
    badges.find((b) => b.href === href && b.count > 0)?.count ?? 0;

  const initial = (personName ?? "You").trim().charAt(0).toUpperCase() || "Y";

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-line-soft bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 py-2.5 sm:h-[66px] sm:px-8 sm:py-0">
          {/* Identity. Whose books these are, on every screen. */}
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-teal"
            >
              <span className="grid grid-cols-2 gap-1">
                <span className="h-[5px] w-[5px] rounded-full bg-white" />
                <span className="h-[5px] w-[5px] rounded-full bg-white/55" />
                <span className="h-[5px] w-[5px] rounded-full bg-white/55" />
                <span className="h-[5px] w-[5px] rounded-full bg-white" />
              </span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-base font-extrabold tracking-[-0.02em] text-ink">
                {businessName}
              </span>
              {locationName && (
                <span className="block truncate text-[11px] font-semibold text-slate-grey">
                  {locationName}
                </span>
              )}
            </span>
          </div>

          {/* Account. The design puts a person chip here, so it does the
              job a person chip should: it is the way out. */}
          <div ref={account} className="relative hidden flex-none sm:block">
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              className="tap flex items-center gap-2.5 rounded-control bg-light-grey py-1.5 pl-1.5 pr-3 hover:bg-line-soft"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-navy-deep text-xs font-extrabold text-on-dark-strong"
              >
                {initial}
              </span>
              <span className="text-[13px] font-bold text-ink">{personName}</span>
            </button>

            {accountOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-panel border border-line-soft bg-white p-2 shadow-lift"
              >
                <p className="px-3 py-2 text-xs font-medium text-slate-grey">
                  Signed in to{" "}
                  <span className="font-bold text-ink">{businessName}</span>
                </p>
                {businessCount > 1 && (
                  <Link
                    href="/switch"
                    onClick={() => setAccountOpen(false)}
                    className="tap block rounded-chip px-3 py-2.5 text-sm font-bold text-teal-dark hover:bg-teal-light"
                  >
                    Open another business
                  </Link>
                )}
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  className="tap block w-full rounded-chip px-3 py-2.5 text-left text-sm font-bold text-ink-muted hover:bg-light-grey disabled:opacity-60"
                >
                  {signingOut ? "Signing you out..." : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs. Desktop only: the phone gets the same destinations as a
            bottom row instead, where a thumb can reach them. */}
        <div className="mx-auto hidden max-w-[1200px] px-8 sm:block">
          {/* Scrolls rather than clips. A business running every set has
              thirteen destinations, which fits today and would not if one
              more were ever added. */}
          <div className="scr flex gap-1 overflow-x-auto">
            {items.map((item) => {
              const on = isActive(item.href);
              const count = badgeFor(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex items-center gap-2 px-[18px] pb-[15px] pt-3.5 text-sm tracking-[-0.01em] ${
                    on ? "font-bold text-teal-dark" : "font-semibold text-ink-muted"
                  }`}
                >
                  {item.short}
                  {count > 0 && (
                    <span className="num rounded-full bg-gold-tint px-[7px] py-0.5 text-[10.5px] font-extrabold text-gold-ink">
                      {count}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-[3px] ${
                      on ? "bg-teal" : "bg-transparent"
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spacer so the fixed bar never covers the last row of content */}
      <div aria-hidden className="h-[env(safe-area-inset-bottom)] sm:hidden" />

      <nav
        aria-label="Your business"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="mx-auto flex max-w-2xl">
          {tabs.map((item) => {
            const count = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`tap relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                  isActive(item.href) ? "text-teal-dark" : "text-ink-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-0.5 w-6 rounded-full ${
                    isActive(item.href) ? "bg-teal" : "bg-transparent"
                  }`}
                />
                {item.short}
                {count > 0 && (
                  <span className="num absolute right-[18%] top-1 rounded-full bg-gold-tint px-1.5 text-[9.5px] font-extrabold text-gold-ink">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Permanent. It holds the way out, and a business with four
              destinations used to have no More button at all, which would
              have left sign out unreachable for exactly the people with the
              simplest setup. */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={`tap flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold ${
              activeInRest ? "text-teal-dark" : "text-ink-muted"
            }`}
          >
            <span
              aria-hidden
              className={`h-0.5 w-6 rounded-full ${
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
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 sm:hidden"
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
                className="tap px-2 text-sm font-medium text-ink-muted"
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

            <div className="mt-2 border-t border-line pt-3">
              <p className="px-3 text-xs font-medium text-ink-muted">
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
