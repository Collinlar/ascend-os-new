"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isBareRoute, NAV_GROUP_LABEL, type NavGroup, type NavItem } from "@/lib/nav/routes";
import { Icon } from "./icons";
import TopBar, { Bell, PlaceSwitcher, type Place } from "./TopBar";

// The workspace shell (v3 design, D2).
//
// Two shapes of the same thing. On a desktop it is the Business Web
// sidebar: the logo, whose business this is, the destinations, More, and
// the person at the foot. On a phone (77% of the traffic) it is a slim top
// bar with the business's name and a frosted row of tabs under the thumb.
//
// It wraps the page rather than sitting beside it, so the sidebar can hold
// the left edge and every page keeps its own layout inside the space left.
// On the till, onboarding and the public pages it steps aside entirely.
//
// One component rather than two, because the tabs, the badges and the
// account menu all have to agree about what is open and who is signed in.

const PHONE_TABS = 4;

export interface NavBadge {
  href: string;
  count: number;
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "A";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function NavBar({
  items,
  businessName,
  locationName,
  personName,
  roleName,
  businessCount = 1,
  badges = [],
  places = [],
  locationId = null,
  children,
}: {
  items: NavItem[];
  businessName: string;
  locationName?: string | null;
  personName?: string;
  roleName?: string | null;
  businessCount?: number;
  /** Counts shown against a destination, for work that is waiting. */
  badges?: NavBadge[];
  /** The places this person can look at, and the one they are looking at. */
  places?: Place[];
  locationId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  // Which bar is showing. The bell asks Ascend what is waiting, so only the
  // visible bar carries one; before the first paint, neither does.
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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

  // The More sheet closes on Escape too, and whenever the page changes.
  useEffect(() => {
    if (!moreOpen) return;
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [moreOpen]);
  useEffect(() => setMoreOpen(false), [pathname]);

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

  if (isBareRoute(pathname) || items.length === 0) return <>{children}</>;

  const main = items.filter((i) => !i.more);
  const more = items.filter((i) => i.more);
  // The phone's tabs are the screens needed most often, wherever they sit
  // in the sidebar; Home is always first.
  const tabs = [...main]
    .sort((a, b) => (a.href === "/dashboard" ? -1 : b.href === "/dashboard" ? 1 : (a.rank ?? 99) - (b.rank ?? 99)))
    .slice(0, PHONE_TABS);
  const behindMore = [...main.filter((i) => !tabs.includes(i)), ...more];

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  const activeBehindMore = behindMore.some((i) => isActive(i.href));

  const badgeFor = (href: string) =>
    badges.find((b) => b.href === href && b.count > 0)?.count ?? 0;

  const person = personName ?? "You";

  const sideLink = (item: NavItem) => {
    const on = isActive(item.href);
    const count = badgeFor(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={on ? "page" : undefined}
        className={`tap flex h-10 min-h-[40px] items-center gap-[11px] rounded-[10px] px-2.5 text-sm ${
          on ? "bg-teal-50 font-bold text-teal-800" : "font-medium text-neutral-700 hover:bg-teal-50"
        }`}
      >
        <Icon name={item.icon} />
        <span className="flex-1 truncate">{item.label}</span>
        {count > 0 && (
          <span className="num flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-700 px-1.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* ------------------------------------------------ desktop sidebar */}
      <nav
        aria-label="Your business"
        className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-3.5 border-r border-neutral-100 bg-white px-3.5 pb-3.5 pt-[18px] lg:flex"
      >
        <Link href="/dashboard" className="ml-1.5 self-start" aria-label="AscendSME, home">
          <Image src="/brand/ascendsme-logo.webp" alt="AscendSME" width={140} height={24} priority />
        </Link>

        <div className="flex items-center gap-2.5 rounded-[14px] bg-neutral-50 p-2.5">
          <span
            aria-hidden
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-teal font-heading text-sm font-extrabold text-white"
          >
            {initials(businessName)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-bold text-ink">{businessName}</span>
            {locationName && <span className="truncate text-[11.5px] text-neutral-500">{locationName}</span>}
          </span>
        </div>

        <div className="scr flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {main.filter((i) => !i.group).map(sideLink)}
          {(Object.keys(NAV_GROUP_LABEL) as NavGroup[]).map((group) => {
            const inGroup = main.filter((i) => i.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-0.5">
                <span className="px-2.5 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {NAV_GROUP_LABEL[group]}
                </span>
                {inGroup.map(sideLink)}
              </div>
            );
          })}
          {more.length > 0 && (
            <>
              <span className="px-2.5 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                More
              </span>
              {more.map(sideLink)}
            </>
          )}
        </div>

        {/* The person, and the way out. */}
        <div ref={account} className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            className="tap flex w-full items-center gap-2.5 rounded-[12px] px-1.5 py-1 text-left hover:bg-neutral-50"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-[11.5px] font-bold text-white"
            >
              {initials(person)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-ink">{person}</span>
              {roleName && <span className="text-[11.5px] text-neutral-500">{roleName}</span>}
            </span>
            <Icon name="up" size={16} />
          </button>

          {accountOpen && (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+8px)] left-0 w-full rounded-panel border border-neutral-100 bg-white p-2 shadow-float"
            >
              <p className="px-3 py-2 text-xs font-medium text-neutral-500">
                Signed in to <span className="font-bold text-ink">{businessName}</span>
              </p>
              {businessCount > 1 && (
                <Link
                  href="/switch"
                  onClick={() => setAccountOpen(false)}
                  className="tap flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold text-teal-dark hover:bg-teal-50"
                >
                  <Icon name="swap" size={16} />
                  Open another business
                </Link>
              )}
              <button
                onClick={signOut}
                disabled={signingOut}
                className="tap flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
              >
                <Icon name="logout" size={16} />
                {signingOut ? "Signing you out..." : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* -------------------------------------------------- phone top bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white lg:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <span
            aria-hidden
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-teal font-heading text-[13px] font-extrabold text-white"
          >
            {initials(businessName)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-bold text-ink">{businessName}</span>
            {locationName && places.length < 2 && (
              <span className="block truncate text-[11.5px] font-medium text-neutral-500">{locationName}</span>
            )}
          </span>
          <span className="flex-1" />
          <PlaceSwitcher places={places} current={locationId} compact />
          {desktop === false && <Bell />}
        </div>
      </header>

      {/* The page, in the space the sidebar leaves. */}
      <div className="lg:pl-[248px]">
        <TopBar places={places} current={locationId} bell={desktop === true} />
        {children}
      </div>

      {/* ---------------------------------------------- phone bottom tabs */}
      <nav
        aria-label="Your business"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-[14px] lg:hidden"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {tabs.map((item) => {
            const on = isActive(item.href);
            const count = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`tap relative flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold ${
                  on ? "text-teal-800" : "text-neutral-500"
                }`}
              >
                <Icon name={item.icon} size={22} />
                {item.short}
                {count > 0 && (
                  <span className="num absolute left-1/2 top-1 ml-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-white bg-orange-700 px-1 text-[10px] font-bold text-white">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Permanent. It holds the way out, so even a business with four
              destinations can always sign out. */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={`tap flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold ${
              activeBehindMore ? "text-teal-800" : "text-neutral-500"
            }`}
          >
            <Icon name="menu" size={22} />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-navy/40 lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="max-h-[85vh] animate-sheetup overflow-y-auto rounded-t-hero bg-white px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <p className="font-heading text-lg font-bold text-ink">Everything else</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="tap px-2 text-sm font-semibold text-neutral-600"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {behindMore.map((item) => {
                const on = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={`tap flex items-center gap-3 rounded-[12px] px-3 py-3 text-[15px] ${
                      on ? "bg-teal-50 font-bold text-teal-800" : "font-medium text-ink hover:bg-neutral-50"
                    }`}
                  >
                    <Icon name={item.icon} size={20} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 border-t border-neutral-100 pt-3">
              <p className="px-3 text-xs font-medium text-neutral-500">
                {person}
                {roleName ? `, ${roleName.toLowerCase()} at ` : " at "}
                <span className="font-bold text-ink">{businessName}</span>
              </p>
              {businessCount > 1 && (
                <Link
                  href="/switch"
                  className="tap mt-1 flex items-center gap-3 rounded-[12px] px-3 py-3 font-semibold text-teal-dark hover:bg-neutral-50"
                >
                  <Icon name="swap" size={20} />
                  Open another business
                </Link>
              )}
              <button
                onClick={signOut}
                disabled={signingOut}
                className="tap mt-1 flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
              >
                <Icon name="logout" size={20} />
                {signingOut ? "Signing you out..." : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
