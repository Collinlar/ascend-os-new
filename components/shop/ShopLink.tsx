"use client";

import { useState } from "react";

// The shop's address, and getting it to a customer.
//
// The storefront was built, worked, and was unreachable: a merchant was
// never shown the link anywhere, so nobody could share it and no customer
// could ever arrive. A shop nobody can find is not a shop.
//
// Sharing is WhatsApp first because that is where a Ghanaian merchant
// actually sends things. Copying is the fallback for everywhere else.

export default function ShopLink({
  shopUrl,
  businessName,
}: {
  /** Full address, built on the server so it is in the first paint. */
  shopUrl: string | null;
  businessName: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = shopUrl ?? "";

  return (
    <section className="border border-line bg-white p-5">
      <p className="mono text-[11px] uppercase tracking-eyebrow text-teal-dark">
        Your shop address
      </p>
      <h2 className="mt-2 text-lg font-semibold text-ink">
        Send this to your customers.
      </h2>
      <p className="num mt-3 break-all bg-light-grey px-3 py-2 text-sm text-ink">
        {url || "Your shop address is being prepared."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Order from ${businessName}: ${url}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap flex items-center bg-teal px-4 text-sm font-semibold text-white"
        >
          Share on WhatsApp
        </a>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
          className="tap flex items-center border border-line px-4 text-sm font-medium text-ink"
        >
          {copied ? "Copied" : "Copy the link"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap flex items-center px-4 text-sm font-medium text-teal-dark"
        >
          See what customers see
        </a>
      </div>
    </section>
  );
}
