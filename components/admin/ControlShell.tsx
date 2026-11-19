"use client";

// @contrast-surface navy
// The Control Center's chrome, on the v3 design: deep navy, the colour
// system's ground for the Control Center. A sidebar from 1024px, a top bar
// with a scrolling row of desks below that. Only a platform admin ever sees
// it (app/admin/layout.tsx).

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ControlNavItem {
  href: string;
  label: string;
}

export default function ControlShell({
  items,
  who,
  children,
}: {
  items: ControlNavItem[];
  who: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const on = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <aside className="flex-none bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[240px] lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block">
          <span className="flex flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ascendsme-logo.webp" alt="AscendSME" width={110} height={22} className="h-[22px] w-auto brightness-0 invert" />
            <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-mint-bright">Control Center</span>
          </span>
          <span className="text-right text-[12px] text-white/70 lg:mt-3 lg:block lg:text-left">{who}</span>
        </div>
        <nav aria-label="Control Center" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={on(it.href) ? "page" : undefined}
              className={`tap flex flex-none items-center rounded-control px-3.5 text-[14px] font-semibold ${
                on(it.href) ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white"
              }`}
            >
              {it.label}
            </Link>
          ))}
        </nav>
        <span className="hidden flex-1 lg:block" />
        <Link href="/dashboard" className="tap mx-3 mb-4 hidden items-center rounded-control px-3.5 text-[13.5px] font-semibold text-white/75 hover:text-white lg:flex">
          Back to my business
        </Link>
      </aside>
      {/* @contrast-surface canvas */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
