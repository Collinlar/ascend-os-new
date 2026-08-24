"use client";

import { formatGHS } from "@/lib/money";
import { BackButton } from "./storefront-parts";

// Where a stranger hands over their name and number.
//
// Kept to the four things the shop genuinely needs to fulfil the order.
// There is no card form here because nothing on this platform can take a
// card yet: the shop confirms on WhatsApp and money changes hands when the
// goods do. Showing a payment step that does not exist would be the one
// lie a customer would never forgive.

export type Fulfilment = "pickup" | "merchant_delivery";

export default function Checkout({
  businessName,
  itemCount,
  subtotal,
  customerName,
  phone,
  fulfilment,
  address,
  placing,
  error,
  onBack,
  onChange,
  onPlace,
}: {
  businessName: string;
  itemCount: number;
  subtotal: number;
  customerName: string;
  phone: string;
  fulfilment: Fulfilment;
  address: string;
  placing: boolean;
  error: string | null;
  onBack: () => void;
  onChange: (patch: {
    customerName?: string;
    phone?: string;
    fulfilment?: Fulfilment;
    address?: string;
  }) => void;
  onPlace: () => void;
}) {
  const delivering = fulfilment === "merchant_delivery";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onPlace();
      }}
      className="mx-auto max-w-2xl px-5 pb-40 pt-4 sm:px-11"
    >
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} label="Back to your basket" />
        <h1 className="text-xl font-extrabold text-ink">Your details</h1>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <fieldset>
          <legend className="text-xs font-bold text-ink-muted">
            How would you like it?
          </legend>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Choice
              active={!delivering}
              onClick={() => onChange({ fulfilment: "pickup" })}
              title="I will collect it"
              detail="Come to the shop"
            />
            <Choice
              active={delivering}
              onClick={() => onChange({ fulfilment: "merchant_delivery" })}
              title="Bring it to me"
              detail="Cost agreed on WhatsApp"
            />
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="customerName"
            className="text-xs font-bold text-ink-muted"
          >
            Your name
          </label>
          <input
            id="customerName"
            value={customerName}
            onChange={(e) => onChange({ customerName: e.target.value })}
            autoComplete="name"
            placeholder="Who should they ask for?"
            className="mt-2 w-full rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal"
          />
        </div>

        <div>
          <label htmlFor="phone" className="text-xs font-bold text-ink-muted">
            Your WhatsApp number
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 000 0000"
            className="num mt-2 w-full rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal"
          />
          <p className="mt-1.5 text-[11.5px] font-medium text-slate-grey">
            This is how {businessName} reaches you about the order.
          </p>
        </div>

        {delivering && (
          <div>
            <label htmlFor="address" className="text-xs font-bold text-ink-muted">
              Where to bring it
            </label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => onChange({ address: e.target.value })}
              rows={3}
              placeholder="Area, street and the closest landmark"
              className="mt-2 w-full resize-none rounded-control border border-line-strong bg-surface px-4 py-3 font-medium leading-snug text-ink outline-none placeholder:text-slate-grey focus:border-teal"
            />
          </div>
        )}

        {/* Said plainly, because a customer deciding whether to type their
            number wants to know what happens to their money first. */}
        <div className="flex gap-3 rounded-panel border border-line bg-teal-light px-4 py-3.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 flex-none">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" stroke="#0B6F65" strokeWidth="1.6" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#0B6F65" strokeWidth="1.6" />
          </svg>
          <p className="text-[12.5px] font-medium leading-snug text-teal-dark">
            You pay nothing now. {businessName} messages you on WhatsApp to
            confirm, and you settle when you collect it or when it reaches you.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-panel bg-surface px-4 py-4">
          <Row
            label={`${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            value={formatGHS(subtotal)}
          />
          <Row
            label={delivering ? "Delivery" : "Collection"}
            value={delivering ? "Agreed with the shop" : "Free"}
          />
          <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2.5">
            <span className="text-[14.5px] font-extrabold text-ink">
              To pay on the day
            </span>
            <span className="num text-xl font-extrabold text-ink">
              {formatGHS(subtotal)}
            </span>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="mb-2 text-sm font-semibold text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={placing}
            className="tap flex w-full items-center justify-center rounded-panel bg-navy-deep font-bold text-white disabled:opacity-60"
          >
            {placing
              ? `Sending your order to ${businessName}...`
              : `Place my order · ${formatGHS(subtotal)}`}
          </button>
        </div>
      </div>
    </form>
  );
}

function Choice({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap flex flex-col justify-center rounded-control border px-4 py-3 text-left ${
        active
          ? "border-teal bg-teal-light text-teal-dark"
          : "border-line bg-surface text-ink-soft"
      }`}
    >
      <span className="text-[13.5px] font-bold">{title}</span>
      <span className="mt-0.5 text-[11px] font-medium opacity-85">{detail}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[12.5px] font-medium text-ink-muted">{label}</span>
      <span className="num text-[12.5px] font-semibold text-ink-muted">
        {value}
      </span>
    </div>
  );
}
