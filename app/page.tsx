import Link from "next/link";
import { Eyebrow, Wordmark } from "@/components/brand/Mark";

// Entry: route each business to the smallest useful starting experience
// (§12.1). No product-portfolio lecture before starting (ONB-002).
//
// Styling follows the AscendSME design identity: dark navy ground, mono
// eyebrows, tight display type, and cards that lift rather than cast.

const PATHS = [
  {
    href: "/onboarding?path=pos",
    set: "Ascend POS",
    title: "I sell to people who walk in",
    detail: "Sell fast, print receipts, watch your stock and your cash.",
  },
  {
    href: "/onboarding?path=shop",
    set: "Ascend Shop",
    title: "I sell online and on WhatsApp",
    detail: "Turn your product photos into a Shop people can order from.",
  },
  {
    href: "/onboarding?path=services",
    set: "Ascend Services",
    title: "People book my time or my work",
    detail: "Take bookings, collect deposits and keep your schedule tight.",
  },
  {
    href: "/onboarding?path=documents",
    set: "Ascend Documents",
    title: "I need proper quotes, invoices and receipts",
    detail: "Create professional documents and follow the money owed to you.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-page">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Wordmark tone="light" size={18} />
          <Link
            href="/signin"
            className="tap flex items-center text-sm font-bold text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero. The claim is what the business gets, not what we built. */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-3xl px-5 pb-14 pt-8">
          <Eyebrow tone="mint">Built with Ghanaian businesses</Eyebrow>
          <h1 className="mt-5 max-w-lg text-[42px] font-extrabold leading-display tracking-[-0.035em] sm:text-[52px]">
            Start with what your business needs today.
          </h1>
          <p className="mt-5 max-w-md text-[17px] font-medium leading-body text-on-dark">
            Everything stays connected as you grow. Your customers, products,
            money and records live in one place, whichever way you start.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10">
        <Eyebrow>Choose where to start</Eyebrow>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {PATHS.map((path) => (
            <Link
              key={path.href}
              href={path.href}
              className="tap group flex flex-col rounded-card border border-line bg-white p-6 shadow-card transition-colors hover:border-teal"
            >
              <span className="mono text-[11px] uppercase tracking-eyebrow text-teal-dark">
                {path.set}
              </span>
              <span className="mt-2.5 text-[19px] font-extrabold tracking-[-0.015em] text-ink">
                {path.title}
              </span>
              <span className="mt-2 flex-1 text-[14.5px] leading-body text-mid-grey">
                {path.detail}
              </span>
              <span className="mt-4 text-sm font-bold text-teal-dark">
                Start here &rarr;
              </span>
            </Link>
          ))}
        </div>

        {/* What stays true whichever door they come through. */}
        <div className="mt-10 rounded-card border border-line bg-white p-6 shadow-card">
          <Eyebrow>Whichever way you start</Eyebrow>
          <p className="mt-3 text-[17px] font-bold leading-snug text-ink">
            Everything your business does builds one connected record.
          </p>
          <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {[
              "One business identity",
              "One customer history",
              "One catalogue",
              "One inventory record",
              "One financial record",
              "One operating history",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-teal" />
                <span className="text-[15px] font-semibold text-ink-soft">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mono mt-8 text-center text-xs text-soft-grey">
          Built by Bold Vision MultiTech in Accra, for African businesses.
        {" "}
        <a href="/pos" className="font-medium text-teal-dark underline">
          Setting up a till on this device?
        </a>
        </p>
      </section>
    </main>
  );
}
