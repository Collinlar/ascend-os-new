"use client";

import { useState } from "react";

// The booking page's address, and getting it to a customer.
//
// The page has existed and worked for a long time, and appeared nowhere in
// the product: no merchant was ever shown the link, so nobody could send
// it and nobody ever booked. Zero bookings, on a booking system that was
// otherwise finished.
//
// WhatsApp first, because that is where a Ghanaian business sends things.

export default function BookingLink({
  url,
  businessName,
  bookable,
}: {
  url: string | null;
  businessName: string;
  /** How many services a customer would actually find there. */
  bookable: number;
}) {
  const [copied, setCopied] = useState(false);
  const address = url ?? "";

  return (
    <section className="rounded-[18px] border border-line-soft bg-white p-5 shadow-lift">
      <p className="mono text-[11px] uppercase tracking-eyebrow text-teal-dark">
        Your booking page
      </p>
      <h2 className="mt-2 text-lg font-extrabold tracking-[-0.02em] text-ink">
        Send this to anyone who wants a time.
      </h2>
      <p className="num mt-3 break-all rounded-panel bg-light-grey px-3 py-2 text-sm text-ink">
        {address || "Your booking address is being prepared."}
      </p>

      {bookable === 0 && (
        <p className="mt-3 rounded-panel bg-gold-light px-4 py-3 text-[12.5px] font-semibold text-gold-ink">
          Nothing is listed yet, so this page opens empty. Add a service
          below before you send it to anybody.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Book ${businessName}: ${address}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap flex items-center rounded-control bg-teal px-4 text-sm font-bold text-white hover:bg-teal-hover"
        >
          Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(address).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
          className="tap flex items-center rounded-control border border-line px-4 text-sm font-bold text-ink-slate"
        >
          {copied ? "Copied" : "Copy the link"}
        </button>
        <a
          href={address}
          target="_blank"
          rel="noopener noreferrer"
          className="tap flex items-center rounded-control px-4 text-sm font-bold text-teal-dark"
        >
          See what customers see
        </a>
      </div>
    </section>
  );
}
