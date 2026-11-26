"use client";

import { formatGHS } from "@/lib/money";
import { BackButton } from "./storefront-parts";
import { fulfilmentFacts, type ShopSettings } from "@/lib/shop/settings";

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
  settings,
  places,
  area,
  deliveryFee,
  placeOptions,
  placeId,
  gps,
  offers,
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
  /** Pickup, delivery areas and fees (round 2, R3). */
  settings: ShopSettings;
  places: string[];
  area: string;
  /** The fee for the chosen area; null while none is chosen. */
  deliveryFee: number | null;
  /** The shop's places, to choose where to collect (R4). */
  placeOptions: Array<{ id: string; name: string; city: string | null }>;
  placeId: string;
  /** GhanaPost GPS or a landmark (R4). */
  gps: string;
  /** Offers on WhatsApp, unticked until ticked (R4). */
  offers: boolean;
  placing: boolean;
  error: string | null;
  onBack: () => void;
  onChange: (patch: {
    customerName?: string;
    phone?: string;
    fulfilment?: Fulfilment;
    address?: string;
    area?: string;
    placeId?: string;
    gps?: string;
    offers?: boolean;
  }) => void;
  onPlace: () => void;
}) {
  const delivering = fulfilment === "merchant_delivery";
  const facts = fulfilmentFacts(settings, places.length > 1 ? places : []);
  const areas = settings.deliveryAreas;
  const total = subtotal + (delivering ? deliveryFee ?? 0 : 0);
  const ghs = (n: number) => (n === 0 ? "Free" : formatGHS(n));

  const placeButton = (
    <button
      type="submit"
      disabled={placing || (delivering && areas.length > 0 && deliveryFee === null)}
      className="tap flex w-full items-center justify-center rounded-panel bg-navy-deep font-bold text-white disabled:opacity-60"
    >
      {placing
        ? `Sending your order to ${businessName}...`
        : delivering && areas.length > 0 && deliveryFee === null
          ? "Pick your delivery area"
          : `Place my order · ${formatGHS(total)}`}
    </button>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onPlace();
      }}
      className="mx-auto max-w-[1100px] px-5 pb-40 pt-4 sm:px-11 lg:pb-16"
    >
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} label="Back to your basket" />
        <h1 className="text-xl font-extrabold text-ink">Your details</h1>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">
        <fieldset>
          <legend className="text-xs font-bold text-ink-muted">
            How would you like it?
          </legend>
          <div className={`mt-2.5 grid gap-2.5 ${facts.pickup && facts.delivery ? "grid-cols-2" : "grid-cols-1"}`}>
            {facts.pickup && (
              <Choice
                active={!delivering}
                onClick={() => onChange({ fulfilment: "pickup" })}
                title="I will collect it"
                detail={settings.saved ? `Free${settings.pickupReadyMinutes ? ` · ${facts.pickup.detail.split(" · ").pop()}` : ""}` : "Come to the shop"}
              />
            )}
            {facts.delivery && (
              <Choice
                active={delivering}
                onClick={() => onChange({ fulfilment: "merchant_delivery" })}
                title="Bring it to me"
                detail={facts.delivery.detail}
              />
            )}
          </div>
        </fieldset>

        {!delivering && placeOptions.length > 1 && (
          <fieldset>
            <legend className="text-xs font-bold text-ink-muted">Where will you collect it?</legend>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {placeOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange({ placeId: p.id })}
                  aria-pressed={placeId === p.id}
                  className={`tap flex min-h-[48px] flex-col justify-center rounded-control border px-4 py-2.5 text-left ${
                    placeId === p.id ? "border-teal bg-teal-light text-teal-dark" : "border-line bg-surface text-ink-soft"
                  }`}
                >
                  <span className="text-[13.5px] font-bold">{p.name}</span>
                  {p.city && <span className="text-[11.5px] font-medium opacity-85">{p.city}</span>}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {delivering && areas.length > 0 && (
          <fieldset>
            <legend className="text-xs font-bold text-ink-muted">Which area?</legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {areas.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => onChange({ area: a.name })}
                  aria-pressed={area === a.name}
                  className={`tap inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] px-4 text-[13.5px] font-semibold ${
                    area === a.name ? "border-teal bg-teal-light text-teal-dark" : "border-line bg-surface text-ink-soft"
                  }`}
                >
                  {a.name}
                  <span className="num text-[12.5px] opacity-85">{ghs(a.fee)}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] font-medium text-slate-grey">
              Not listed? {settings.pickupEnabled ? "Choose pickup, or ask" : "Ask"} {businessName} on WhatsApp.
            </p>
          </fieldset>
        )}

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
            <label htmlFor="gps" className="mt-3 block text-xs font-bold text-ink-muted">
              GhanaPost GPS, if you have it
            </label>
            <input
              id="gps"
              value={gps}
              onChange={(e) => onChange({ gps: e.target.value.toUpperCase() })}
              maxLength={20}
              autoCapitalize="characters"
              placeholder="GA-123-4567"
              className="mono mt-2 w-full rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal"
            />
            <p className="mt-1.5 text-[11.5px] font-medium text-slate-grey">It helps the rider find you. A landmark above works too.</p>
          </div>
        )}

        {/* Offers: asked, never assumed. Unticked until they tick it. */}
        <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-line px-4 py-3.5">
          <input
            type="checkbox"
            checked={offers}
            onChange={(e) => onChange({ offers: e.target.checked })}
            className="mt-0.5 h-5 w-5 flex-none accent-teal"
          />
          <span className="text-[13px] font-medium leading-snug text-ink-muted">
            Send me offers from {businessName} on WhatsApp. You can stop anytime.
          </span>
        </label>

      </div>

      {/* What it comes to, and the button: under the form on a phone,
          beside it on a laptop (R4). */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          {/* Said plainly, because a customer deciding whether to type their
              number wants to know what happens to their money first. */}
          <div className="flex gap-3 rounded-panel border border-line bg-teal-light px-4 py-3.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 flex-none">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" stroke="#006B62" strokeWidth="1.6" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#006B62" strokeWidth="1.6" />
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
              label={delivering ? (area && areas.length ? `Delivery to ${area}` : "Delivery") : "Collection"}
              value={
                !delivering
                  ? "Free"
                  : areas.length === 0
                    ? "Agreed with the shop"
                    : deliveryFee === null
                      ? "Pick an area"
                      : ghs(deliveryFee)
              }
            />
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2.5">
              <span className="text-[14.5px] font-extrabold text-ink">
                To pay on the day
              </span>
              <span className="num text-xl font-extrabold text-ink">
                {formatGHS(total)}
              </span>
            </div>
          </div>
        <div className="hidden lg:block">
          {error && <p className="mb-2 text-sm font-semibold text-danger">{error}</p>}
          {placeButton}
        </div>
      </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="mb-2 text-sm font-semibold text-danger">{error}</p>
          )}
          {placeButton}
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
