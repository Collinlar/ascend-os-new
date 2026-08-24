"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
}: {
  items: NavItem[];
  businessName: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

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

          {rest.length > 0 && (
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
          )}
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
          </div>
        </div>
      )}
    </>
  );
}
