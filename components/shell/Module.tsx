"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ModuleIdentity, ModuleTab } from "@/lib/nav/modules";
import { Icon } from "./icons";
import { ACTION_SLOT, SEARCH_SLOT } from "./TopBar";

// The module header band and the page under it (business modules design, M1).
//
// White, under the top bar: the module's icon on a teal tile, its name over
// the screen's title, one line on what it is for, and its tabs underlined.
// The page's search and its one primary action go up into the desktop top
// bar; on a phone, where there is no top bar, they sit in the band.

export interface ModuleSearch {
  /** Where the search goes: the page that reads ?q=. */
  action: string;
  placeholder: string;
  defaultValue?: string;
  /** Other query values to keep when searching, such as the open tab. */
  keep?: Record<string, string>;
}

function SearchBox({ search }: { search: ModuleSearch }) {
  return (
    <form action={search.action} role="search" className="flex w-full">
      {Object.entries(search.keep ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex h-11 w-full items-center gap-2.5 rounded-control bg-neutral-100 px-3.5 text-neutral-500 focus-within:ring-2 focus-within:ring-teal lg:h-10">
        <Icon name="search" size={17} />
        <input
          name="q"
          type="search"
          defaultValue={search.defaultValue}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-neutral-500 lg:text-[13.5px]"
        />
      </label>
    </form>
  );
}

export function ModuleBand({
  identity,
  title,
  tabs = [],
  search,
  action,
}: {
  identity: ModuleIdentity;
  /** The screen's own title when it is not the module's name. */
  title?: string;
  tabs?: ModuleTab[];
  search?: ModuleSearch;
  action?: ReactNode;
}) {
  // On a desktop the search and the action move up into the top bar. Until
  // the page has drawn we cannot know which screen this is, so they start in
  // the band (where a phone needs them) and only one copy ever exists.
  const [slots, setSlots] = useState<{ search: HTMLElement; action: HTMLElement } | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      const s = document.getElementById(SEARCH_SLOT);
      const a = document.getElementById(ACTION_SLOT);
      setSlots(query.matches && s && a ? { search: s, action: a } : null);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className="border-b border-neutral-100 bg-white">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3.5 px-4 pt-5 sm:px-8 lg:pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3.5">
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              aria-hidden
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-teal-50 text-teal-700"
            >
              <Icon name={identity.icon} size={22} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-teal-700">{identity.kicker}</span>
              <h1 className="truncate font-heading text-[24px] font-extrabold leading-[1.1] tracking-[-0.01em] text-ink-heading sm:text-[26px]">
                {title ?? identity.title}
              </h1>
            </span>
          </div>
          <span className="hidden flex-1 lg:block" />
          <p className="text-[13.5px] leading-[1.45] text-neutral-600 lg:max-w-[440px] lg:text-right">{identity.tagline}</p>
        </div>

        {!slots && (search || action) && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            {search && (
              <div className="min-w-0 flex-1">
                <SearchBox search={search} />
              </div>
            )}
            {action && <div className="flex flex-none flex-wrap gap-2">{action}</div>}
          </div>
        )}
        {slots && search && createPortal(<SearchBox search={search} />, slots.search)}
        {slots && action && createPortal(action, slots.action)}

        {tabs.length > 1 ? (
          <nav
            aria-label={`${identity.title} sections`}
            className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.current ? "page" : undefined}
                className={`tap -mb-px flex h-[42px] flex-none items-center whitespace-nowrap border-b-[2.5px] px-3.5 text-sm ${
                  t.current
                    ? "border-teal font-bold text-teal-800"
                    : "border-transparent font-medium text-neutral-600 hover:text-teal-800"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="h-1.5" />
        )}
      </div>
    </div>
  );
}

/** A module screen: the band, then the page's own content on the app ground. */
export function ModulePage({
  children,
  ...band
}: Parameters<typeof ModuleBand>[0] & { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas">
      <ModuleBand {...band} />
      <div className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-5 sm:px-8 sm:pb-16 sm:pt-[22px]">{children}</div>
    </main>
  );
}
