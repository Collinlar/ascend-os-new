"use client";

import { formatGHS } from "@/lib/money";

// The receipt a customer never asked for but always wants.
//
// Somebody just gave their name and number to a shop they found through a
// link. This screen exists to prove the order landed somewhere real: a
// reference they can quote, the amount, and an honest account of what has
// and has not happened yet.

export default function OrderPlaced({
  businessName,
  orderId,
  total,
  phone,
  delivering,
  onBack,
}: {
  businessName: string;
  orderId: string | null;
  total: number | null;
  phone: string;
  delivering: boolean;
  onBack: () => void;
}) {
  // The real id, shortened to something a person can read down a phone.
  const reference = orderId
    ? orderId.replace(/-/g, "").slice(0, 6).toUpperCase()
    : null;

  const steps = [
    {
      title: "Order placed",
      meta: "Just now",
      done: true,
    },
    {
      title: `${businessName} confirms it`,
      meta: `They message ${phone || "your WhatsApp number"}`,
      done: false,
    },
    {
      title: delivering ? "On its way to you" : "Ready to collect",
      meta: delivering
        ? "They agree the delivery cost with you first"
        : "They tell you when to come",
      done: false,
    },
    {
      title: "Handed over and paid",
      meta: `${total !== null ? formatGHS(total) : "The total"} on the day`,
      done: false,
    },
  ];

  return (
    <div className="mx-auto max-w-xl px-5 py-10 sm:px-11">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 animate-popin items-center justify-center rounded-full bg-teal-light">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <polyline
              points="5,12.5 10,17.5 19,7"
              stroke="#0B6F65"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em] text-ink">
          Your order is with {businessName}.
        </h1>
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-ink-muted">
          Keep your phone close. They confirm on WhatsApp, and nothing is paid
          until you have it.
        </p>
        {reference && (
          <p className="mono mt-3 inline-flex rounded-control bg-light-grey px-4 py-2 text-[13px] text-ink-soft">
            Order {reference}
          </p>
        )}
      </div>

      <h2 className="mt-9 text-sm font-extrabold text-ink">What happens next</h2>
      <ol className="mt-3 rounded-panel border border-line bg-white p-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3.5">
            <div className="flex flex-none flex-col items-center">
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  step.done ? "bg-teal" : "bg-line-stronger"
                }`}
              />
              {i < steps.length - 1 && (
                <span className="w-px flex-1 bg-line" />
              )}
            </div>
            <div className={i < steps.length - 1 ? "pb-4" : ""}>
              <p
                className={`text-[13.5px] font-bold ${
                  step.done ? "text-ink" : "text-ink-muted"
                }`}
              >
                {step.title}
              </p>
              <p className="mt-0.5 text-[11.5px] font-medium text-slate-grey">
                {step.meta}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onBack}
        className="tap mt-5 flex w-full items-center justify-center rounded-panel bg-light-grey font-bold text-ink-soft"
      >
        Back to the shop
      </button>
    </div>
  );
}
