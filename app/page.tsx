import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { ExampleWeek, Goals } from "@/components/website/HomeTabs";

// The ascendsme.africa home, on the v3 website design (D6 plan, approved
// 19 November 2026). Every claim is something Ascend does today: payments
// are recorded, not collected, until Paystack; there is no native app, so
// no store badges; receipts are not sent on WhatsApp. The example weeks are
// examples and say so.

export const metadata: Metadata = {
  title: "AscendSME · More customers. More sales. Less running around.",
  description:
    "Ascend runs your sales, bookings, invoices and stock in one place, then helps new customers find you and regulars come back. Built in Accra for Ghanaian businesses.",
};

export const dynamic = "force-dynamic";

const PATHS = [
  { href: "/onboarding?path=pos", set: "Ascend POS", title: "I sell to people who walk in", detail: "Sell fast, print receipts, watch your stock and your cash." },
  { href: "/onboarding?path=shop", set: "Ascend Shop", title: "I sell online and on WhatsApp", detail: "Turn your product photos into a Shop people can order from." },
  { href: "/onboarding?path=services", set: "Ascend Services", title: "People book my time or my work", detail: "Take bookings, record deposits and keep your schedule tight." },
  { href: "/onboarding?path=documents", set: "Ascend Documents", title: "I need proper quotes, invoices and receipts", detail: "Send invoices by link and follow the money owed to you." },
];

const STAGES = [
  { k: "Your phone", h: "Sell from your phone. Free.", p: "Use the phone you already have. Nothing to buy to start." },
  { k: "A handheld", h: "A terminal with a printer", p: "For your first hire: they sell on their own PIN and the receipt prints in their hand." },
  { k: "A counter", h: "Scanner and customer screen", p: "For the rush: a big screen, a barcode scanner and a screen that shows the customer what they are paying." },
  { k: "More shops", h: "Every shop in one view", p: "Every till and every person, with one set of products and one set of customers." },
];

async function signedInBusiness(): Promise<string | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;
    const { data } = await supabaseServer().from("business").select("name").eq("id", membership.business_id).maybeSingle();
    return (data?.name as string | undefined) ?? "your business";
  } catch {
    return null;
  }
}

export default async function Home() {
  const business = await signedInBusiness();
  const eyebrow = "text-[13px] font-semibold uppercase tracking-[0.24em] text-teal-700";
  const h2 = "font-heading text-[clamp(34px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink-heading";
  const start = (
    <Link href="/onboarding" className="tap inline-flex h-14 items-center rounded-full bg-teal px-8 text-[17px] font-bold text-white hover:bg-teal-hover">
      Start free
    </Link>
  );

  return (
    <main className="min-h-screen bg-white text-ink">
      <header className="border-b border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-[1160px] items-center gap-6 px-5 py-4 sm:px-10">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ascendsme-logo.webp" alt="AscendSME" width={128} height={26} className="h-[26px] w-auto" />
          </Link>
          <nav className="hidden items-center gap-6 text-[15px] font-semibold text-neutral-700 lg:flex" aria-label="On this page">
            <a href="#goals" className="hover:text-ink">What you get</a>
            <a href="#grow" className="hover:text-ink">Grows with you</a>
            <a href="#start" className="hover:text-ink">Get started</a>
            <Link href="/discover" className="hover:text-ink">Discover</Link>
          </nav>
          <span className="flex-1" />
          {business ? (
            <Link href="/dashboard" className="tap inline-flex items-center rounded-full bg-teal px-5 text-[15px] font-bold text-white hover:bg-teal-hover">
              Open {business}
            </Link>
          ) : (
            <>
              <Link href="/signin" className="tap flex items-center text-[15px] font-semibold text-ink">
                Sign in
              </Link>
              <Link href="/onboarding" className="tap hidden items-center rounded-full bg-teal px-5 text-[15px] font-bold text-white hover:bg-teal-hover sm:inline-flex">
                Start free
              </Link>
            </>
          )}
        </div>
      </header>

      {/* 01 Hero. Left-aligned and asymmetric; the soft teal behind it is
          one of the three places a gradient may carry meaning. */}
      <section className="bg-[radial-gradient(ellipse_70%_55%_at_20%_0%,rgba(0,169,157,0.10),transparent_70%)] px-5 pb-16 pt-14 sm:px-10 sm:pt-20">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-12">
          <div className="flex max-w-[860px] flex-col gap-6">
            <h1 className="font-heading text-[clamp(42px,6.6vw,84px)] font-extrabold leading-[0.98] tracking-[-0.035em] text-ink-heading">
              More customers. More sales.
              <span className="block text-teal-700">Less running around.</span>
            </h1>
            <p className="max-w-[620px] text-[clamp(17px,1.7vw,21px)] leading-relaxed text-neutral-600">
              Ascend runs your sales, bookings, invoices and stock in one place, then helps new customers find you and regulars come back.
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {business ? (
                <Link href="/dashboard" className="tap inline-flex h-14 items-center rounded-full bg-teal px-8 text-[17px] font-bold text-white hover:bg-teal-hover">
                  Open {business}
                </Link>
              ) : (
                start
              )}
              <span className="text-[14.5px] text-neutral-600">Works in your phone&apos;s browser. Add it to your home screen.</span>
            </div>
          </div>
          <ExampleWeek />
        </div>
      </section>

      {/* 02 How customers pay, said as it is: recorded, not collected. */}
      <section className="px-5 pb-16 sm:px-10">
        <div className="mx-auto flex max-w-[1160px] flex-col items-center gap-4 text-center">
          <span className="text-[13.5px] text-neutral-600">Cash, MoMo and card, recorded in one place</span>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-2 font-heading text-[clamp(16px,1.6vw,19px)] font-bold text-neutral-500">
            {["Cash", "MTN MoMo", "Telecel Cash", "AT Money", "Card", "On account"].map((r) => (
              <span key={r}>{r}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 03 What you get */}
      <section id="goals" className="scroll-mt-4 bg-[#F1F4F2] px-5 py-20 sm:px-10 sm:py-28">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-10">
          <div className="flex flex-col gap-4">
            <span className={eyebrow}>What you get</span>
            <h2 className={`${h2} max-w-[760px]`}>What do you want to fix first?</h2>
          </div>
          <Goals />
        </div>
      </section>

      {/* 04 Grows with you */}
      <section id="grow" className="scroll-mt-4 px-5 py-20 sm:px-10 sm:py-28">
        <div className="mx-auto grid max-w-[1160px] gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-5">
            <span className={eyebrow}>Grows with you</span>
            <h2 className={`${h2} max-w-[640px]`}>Busier counter? Bigger setup. Same business.</h2>
            <p className="max-w-[520px] text-[17px] leading-relaxed text-neutral-600">
              Start on your phone. Add a handheld, a counter or a second shop when the queue gets longer. Nothing to move, nothing to enter again.
            </p>
          </div>
          <ol className="flex flex-col">
            {STAGES.map((s, i) => (
              <li key={s.k} className="flex gap-5 border-t border-neutral-100 py-6 first:border-t-0 first:pt-0">
                <span className="num flex h-11 w-11 flex-none items-center justify-center rounded-full bg-teal-50 font-heading text-[16px] font-extrabold text-teal-800">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{s.k}</span>
                  <span className="font-heading text-[22px] font-extrabold text-ink-heading">{s.h}</span>
                  <span className="text-[15.5px] leading-relaxed text-neutral-600">{s.p}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 05 Get started */}
      <section id="start" className="scroll-mt-4 bg-[#F1F4F2] px-5 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-10">
          <div className="flex flex-col gap-4">
            <span className={eyebrow}>Get started</span>
            <h2 className={`${h2} max-w-[640px]`}>Selling today. Not next month.</h2>
            <p className="max-w-[560px] text-[17px] leading-relaxed text-neutral-600">
              Free to start, on the phone you have. Help with setting up is there if you want it.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Tell us your business", "Your WhatsApp number and a code. No password to remember."],
              ["Add what you sell", "Products with a price, or the services people book. A photo helps."],
              ["Make your first sale", "On your phone today. A Shop link to share on WhatsApp the same day."],
            ].map(([h, p], i) => (
              <div key={h} className="flex flex-col gap-3 rounded-[24px] bg-white p-7">
                <span className="num font-heading text-[15px] font-extrabold text-teal-700">Step {i + 1}</span>
                <span className="font-heading text-[22px] font-extrabold text-ink-heading">{h}</span>
                <span className="text-[15px] leading-relaxed text-neutral-600">{p}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="font-heading text-[20px] font-extrabold text-ink-heading">Where do you want to start?</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PATHS.map((path) => (
                <Link
                  key={path.href}
                  href={path.href}
                  className="tap group flex flex-col rounded-[20px] border border-line-brand bg-white p-6 transition-colors hover:border-teal"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-teal-800">{path.set}</span>
                  <span className="mt-2 font-heading text-[19px] font-extrabold text-ink-heading">{path.title}</span>
                  <span className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-neutral-600">{path.detail}</span>
                  <span className="mt-4 text-[14px] font-bold text-teal-800">Start here</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 06 Close */}
      <section className="px-5 py-16 sm:px-10 sm:py-24">
        {/* @contrast-surface #00473F */}
        <div className="mx-auto flex max-w-[1160px] flex-col gap-6 rounded-[32px] bg-teal-900 px-7 py-12 text-white sm:px-14 sm:py-16">
          <h2 className="max-w-[820px] font-heading text-[clamp(36px,5.4vw,66px)] font-extrabold leading-[1.02] tracking-[-0.035em]">
            Your next customer is already looking. Be ready.
          </h2>
          <p className="max-w-[560px] text-[17px] leading-relaxed text-white/85">
            Start free with Ascend POS. Add a Shop, bookings and Discover as you grow.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href={business ? "/dashboard" : "/onboarding"}
              className="tap inline-flex h-14 items-center rounded-full bg-teal-bright px-8 text-[17px] font-bold text-teal-deepest"
            >
              {business ? `Open ${business}` : "Start free"}
            </Link>
            <span className="text-[14.5px] text-white/85">Works in your phone&apos;s browser. Add it to your home screen.</span>
          </div>
        </div>
        {/* @contrast-surface white */}
      </section>

      <footer className="border-t border-neutral-100 px-5 py-8 sm:px-10">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3 text-[13.5px] text-neutral-600">
          <span>© {new Date().getFullYear()} AscendSME · Built by Bold Vision MultiTech in Accra</span>
          <span className="flex flex-wrap gap-5">
            <Link href="/discover" className="hover:text-ink">Discover</Link>
            <Link href="/signin" className="hover:text-ink">Sign in</Link>
            <a href="/pos" className="hover:text-ink">Setting up a till on this device?</a>
          </span>
        </div>
      </footer>
    </main>
  );
}
