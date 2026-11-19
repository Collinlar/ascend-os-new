"use client";

// The two tabbed parts of the website home (v3 design): "An example week"
// for a shop, a salon or a chop bar, and "What do you want to fix first?".
//
// Every line here is something Ascend does today (D6 plan, approved 19
// November 2026). The example week is an example and says so; its figures
// are only the kinds Ascend really shows.

import { useState } from "react";

type Tile = { label: string; big: string; sub: string; list: string[]; dark?: boolean };

const WEEKS: { key: string; tab: string; name: string; initials: string; where: string; tiles: Tile[] }[] = [
  {
    key: "shop",
    tab: "Shop",
    name: "Ama's Provisions",
    initials: "AP",
    where: "Provisions shop, Kumasi",
    tiles: [
      { label: "Takings", big: "GH₵8,420", sub: "this week, cash, MoMo and card", list: ["Cash-up balanced, 7 of 7 days", "Best seller: Rice 5kg"], dark: true },
      { label: "Stock", big: "3 items", sub: "flagged before they ran out", list: ["Peak Milk tin: 6 left", "Every sale took itself off the shelf"] },
      { label: "Customers", big: "12 orders", sub: "from the Shop link on WhatsApp", list: ["9 people found her on Discover", "Each one remembered for next time"] },
    ],
  },
  {
    key: "salon",
    tab: "Salon",
    name: "Efua's Hair Studio",
    initials: "EH",
    where: "Salon, Osu, Accra",
    tiles: [
      { label: "Bookings", big: "41", sub: "booked from her link this week", list: ["Deposits recorded on every booking", "Top service: knotless braids"], dark: true },
      { label: "Takings", big: "GH₵5,900", sub: "services and products together", list: ["Hair products added GH₵1,900", "Two stylists, one cash-up"] },
      { label: "Clients", big: "28", sub: "came back this month", list: ["Every visit on one record", "Every booking in one diary"] },
    ],
  },
  {
    key: "chopbar",
    tab: "Chop bar",
    name: "Auntie Akos Chop Bar",
    initials: "AA",
    where: "Chop bar, Takoradi",
    tiles: [
      { label: "Takings", big: "GH₵11,300", sub: "this week, at the counter and by order", list: ["Busiest hour: 12 to 1pm", "Best seller: waakye special"], dark: true },
      { label: "Staff", big: "4", sub: "on their own PINs", list: ["Every refund needed her say", "Shifts closed to the cedi"] },
      { label: "Orders", big: "63", sub: "delivery orders on one list", list: ["Ordered from her Shop link", "Gas and eggs flagged when low"] },
    ],
  },
];

export function ExampleWeek() {
  const [i, setI] = useState(0);
  const w = WEEKS[i];
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <span className="text-[14px] text-neutral-600">An example week for a</span>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1" role="tablist" aria-label="Kind of business">
          {WEEKS.map((x, n) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={n === i}
              onClick={() => setI(n)}
              className={`tap flex items-center rounded-full px-[18px] text-[14.5px] font-semibold ${
                n === i ? "bg-white text-ink shadow-[0_2px_8px_rgba(2,60,55,0.12)]" : "text-neutral-600"
              }`}
            >
              {x.tab}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full rounded-[28px] border border-line-brand bg-white p-5 shadow-[0_30px_70px_rgba(2,91,84,0.08)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-control bg-teal-900 font-heading text-[15px] font-extrabold text-white">
              {w.initials}
            </span>
            <span className="flex flex-col">
              <span className="font-heading text-[16px] font-bold text-ink-heading">{w.name}</span>
              <span className="text-[13px] text-neutral-600">{w.where}</span>
            </span>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-[13px] font-semibold text-neutral-700">An example, not a real shop</span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {w.tiles.map((t) => (
            <div key={t.label} className={`flex flex-col gap-5 rounded-[20px] p-6 ${t.dark ? "bg-teal-900 text-white" : "bg-neutral-50 text-ink"}`}>
              {t.dark && <span className="sr-only">Highlighted</span>}
              {/* @contrast-ignore the tile sets its own ground: mint and white on teal-900 when dark, ink on neutral-50 otherwise */}
              <span className={`text-[12px] font-semibold uppercase tracking-[0.18em] ${t.dark ? "text-teal-mint-bright" : "text-teal-700"}`}>{t.label}</span>
              <span className="flex flex-col gap-2">
                <span className="num font-heading text-[34px] font-extrabold leading-none tracking-[-0.02em]">{t.big}</span>
                <span className={`text-[14px] ${t.dark ? "text-white/85" : "text-neutral-600"}`}>{t.sub}</span>
              </span>
              {/* @contrast-ignore the list's ground follows the tile: white on white/10 over teal-900, ink on white */}
              <span className="mt-auto flex flex-col gap-2">
                {t.list.map((l) => (
                  <span
                    key={l}
                    className={`flex min-h-[44px] items-center rounded-control px-4 text-[13.5px] font-semibold ${
                      t.dark ? "bg-white/10 text-white" : "bg-white text-ink"
                    }`}
                  >
                    {l}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const GOALS: {
  key: string;
  label: string;
  sub: string;
  title: string;
  points: { h: string; p: string }[];
  powered: string[];
  card: { k: string; big: string; unit: string; lines: string[] };
}[] = [
  {
    key: "chasing",
    label: "Less chasing",
    sub: "Fewer mistakes, fewer gaps",
    title: "Every sale, booking and payment in one place.",
    points: [
      { h: "One till for everything", p: "Sell at the counter, take bookings and Shop orders, and send invoices, all from the same app." },
      { h: "Stock that counts itself", p: "Every sale takes itself off the shelf, and you are told before something runs out." },
      { h: "Staff you can trust at the counter", p: "Each person on their own PIN, with shifts and a cash-up that adds up. A refund needs your say." },
    ],
    powered: ["Ascend POS", "Ascend Documents"],
    card: { k: "Cash-up, an example week", big: "7 of 7", unit: "days balanced", lines: ["Cash, MoMo and card in one count", "Keeps selling when the network drops"] },
  },
  {
    key: "found",
    label: "Be found",
    sub: "New people in, regulars back",
    title: "New people find you. Regulars keep coming back.",
    points: [
      { h: "Get found on Discover", p: "Customers nearby search and see your prices and photos, then order from you or book. Paid placement is always marked as paid." },
      { h: "Your own Shop and booking link", p: "Share it on WhatsApp and Instagram. Orders and bookings land in Ascend, next to everything else." },
      { h: "Remember every customer", p: "Every sale, order and booking adds to one record for that customer." },
    ],
    powered: ["Ascend Shop", "Ascend Services", "Discover"],
    card: { k: "Found on Discover, an example month", big: "21", unit: "new customers", lines: ["Seen, tapped and ordered, counted for you", "You choose what to promote, and for how much"] },
  },
  {
    key: "grow",
    label: "See what sells",
    sub: "Do more of what works",
    title: "Know what makes you money. Do more of it.",
    points: [
      { h: "Takings you can see daily", p: "Sales by product, by staff and by till, in plain numbers." },
      { h: "Best sellers and slow movers", p: "Stock more of what sells and less of what sits." },
      { h: "Ready when you want to expand", p: "Your sales history builds your Sustainability Score, a record of how you really run that you can take to a lender." },
    ],
    powered: ["Ascend POS", "Sustainability Score"],
    card: { k: "Sustainability Score, an example", big: "72", unit: "out of 100", lines: ["Built from how the business runs", "Not from what anyone says about it"] },
  },
];

export function Goals() {
  const [i, setI] = useState(0);
  const g = GOALS[i];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-2.5 md:grid-cols-3" role="tablist" aria-label="What you want to fix first">
        {GOALS.map((x, n) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={n === i}
            onClick={() => setI(n)}
            // @contrast-ignore the chosen tab is white on teal-900, the others ink on white
            className={`tap flex items-center gap-3.5 rounded-[20px] px-5 py-[18px] text-left ${
              n === i ? "bg-teal-900 text-white" : "bg-white text-ink hover:shadow-[0_8px_24px_rgba(2,60,55,0.08)]"
            }`}
          >
            {/* @contrast-ignore the tab's own ground: white on teal-900 when chosen, neutral-600 on white otherwise */}
            <span className="flex flex-col">
              <span className="font-heading text-[19px] font-extrabold">{x.label}</span>
              <span className={`text-[13.5px] ${n === i ? "text-white/80" : "text-neutral-600"}`}>{x.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="grid items-center gap-10 rounded-[28px] bg-white p-7 sm:p-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-8">
          <h3 className="font-heading text-[clamp(28px,3.2vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink-heading">{g.title}</h3>
          <div className="flex flex-col gap-6">
            {g.points.map((p) => (
              <div key={p.h} className="flex items-start gap-4">
                <span aria-hidden className="mt-0.5 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[17px] font-bold text-ink">{p.h}</span>
                  <span className="text-[15px] leading-relaxed text-neutral-600">{p.p}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-neutral-100 pt-6">
            <span className="mr-1 text-[13.5px] text-neutral-600">Comes with</span>
            {g.powered.map((p) => (
              <span key={p} className="rounded-full bg-teal-50 px-3 py-1 text-[13px] font-semibold text-teal-800">
                {p}
              </span>
            ))}
          </div>
        </div>
        {/* @contrast-surface #00473F */}
        <div className="flex flex-col gap-6 rounded-[22px] bg-teal-900 p-8 text-white sm:p-10">
          <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-teal-mint-bright">{g.card.k}</span>
          <span className="flex flex-wrap items-end gap-3">
            <span className="num font-heading text-[clamp(38px,4vw,52px)] font-extrabold leading-none tracking-[-0.03em]">{g.card.big}</span>
            <span className="pb-1 text-[16px] text-white/85">{g.card.unit}</span>
          </span>
          <span className="flex flex-col gap-2">
            {g.card.lines.map((l) => (
              <span key={l} className="flex min-h-[44px] items-center rounded-control bg-white/10 px-4 text-[14px] font-semibold">
                {l}
              </span>
            ))}
          </span>
        </div>
        {/* @contrast-surface white */}
      </div>
    </div>
  );
}
