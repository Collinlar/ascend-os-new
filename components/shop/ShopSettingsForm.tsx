"use client";

// Shop settings (round 2, R3). What the storefront promises a customer
// before they order, and what checkout charges for delivery. The preview
// on the right is the storefront's own wording, so the owner sees exactly
// what a customer will read.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/shell/icons";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Toast, useToast } from "@/components/shell/Toast";
import { fulfilmentFacts, promoLive, type ShopSettings } from "@/lib/shop/settings";

const READY: Array<[number | null, string]> = [
  [null, "No promise"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [1440, "Next day"],
];
const RETURNS: Array<[number | null, string]> = [
  [null, "Not said"],
  [0, "No returns"],
  [3, "3 days"],
  [7, "7 days"],
  [14, "14 days"],
  [30, "30 days"],
];

interface Area {
  key: number;
  name: string;
  fee: string;
}
let nextKey = 1;

export default function ShopSettingsForm({
  businessId,
  ready,
  initial,
  places,
  items,
  shopUrl,
}: {
  businessId: string;
  ready: boolean;
  initial: ShopSettings;
  places: string[];
  items: Array<{ id: string; name: string; kind: string }>;
  shopUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast(4000);
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickupEnabled);
  const [readyMinutes, setReadyMinutes] = useState<number | null>(initial.pickupReadyMinutes);
  const [deliveryEnabled, setDeliveryEnabled] = useState(initial.deliveryEnabled);
  const [areas, setAreas] = useState<Area[]>(() =>
    initial.deliveryAreas.length ? initial.deliveryAreas.map((a) => ({ key: nextKey++, name: a.name, fee: String(a.fee) })) : []
  );
  const [cutoff, setCutoff] = useState(initial.deliveryCutoff ?? "");
  const [deliveryNote, setDeliveryNote] = useState(initial.deliveryNote);
  const [returnsDays, setReturnsDays] = useState<number | null>(initial.returnsDays);
  const [returnsNote, setReturnsNote] = useState(initial.returnsNote);
  const [contact, setContact] = useState(initial.contactLine);
  const [headline, setHeadline] = useState(initial.promo.headline);
  const [promoBody, setPromoBody] = useState(initial.promo.body);
  const [promoItem, setPromoItem] = useState(initial.promo.itemId ?? "");
  const [promoUntil, setPromoUntil] = useState(initial.promo.until ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const draft: ShopSettings = {
    pickupEnabled,
    pickupReadyMinutes: readyMinutes,
    deliveryEnabled,
    deliveryAreas: areas.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), fee: Number(a.fee) || 0 })),
    deliveryCutoff: cutoff || null,
    deliveryNote,
    returnsDays,
    returnsNote,
    contactLine: contact,
    promo: { headline, body: promoBody, itemId: promoItem || null, until: promoUntil || null },
    saved: true,
  };
  const facts = fulfilmentFacts(draft, places.length > 1 ? places : []);

  async function save() {
    setError(null);
    if (!pickupEnabled && !deliveryEnabled) return setError("Keep pickup or delivery on, or customers have no way to get their order.");
    const missingFee = areas.find((a) => a.name.trim() && a.fee.trim() === "");
    if (missingFee) return setError(`Add the delivery fee for ${missingFee.name.trim()}. Type 0 if it is free.`);
    setBusy(true);
    try {
      const res = await fetch("/api/shop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          pickupEnabled,
          pickupReadyMinutes: readyMinutes,
          deliveryEnabled,
          deliveryAreas: draft.deliveryAreas,
          deliveryCutoff: cutoff || null,
          deliveryNote,
          returnsDays,
          returnsNote,
          contactLine: contact,
          promoHeadline: headline,
          promoBody,
          promoItemId: promoItem || null,
          promoUntil: promoUntil || null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not save. Check the details and tap again.");
        return;
      }
      setDirty(false);
      toast.show("Saved. Your storefront and checkout use these now.");
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        {!ready && (
          <p className="rounded-panel bg-gold-100 px-4 py-3 text-[13px] font-semibold text-gold-700" role="status">
            These settings switch on after this week&rsquo;s update. Until then your shop offers pickup and delivery, with the delivery cost agreed on WhatsApp.
          </p>
        )}

        <Card>
          <Head title="Pickup" on={pickupEnabled} onFlip={() => touch(setPickupEnabled)(!pickupEnabled)} />
          {pickupEnabled ? (
            <>
              <Label>Ready for pickup in</Label>
              <div className="flex flex-wrap gap-1.5">
                {READY.map(([v, l]) => (
                  <Chip key={l} on={readyMinutes === v} onClick={() => touch(setReadyMinutes)(v)}>
                    {l}
                  </Chip>
                ))}
              </div>
              <Hint>
                {places.length > 1 ? `Customers pick ${places.join(" or ")}.` : places.length === 1 ? `Collected from ${places[0]}.` : "Collected from your shop."} Pickup is always free.
              </Hint>
            </>
          ) : (
            <Hint>Customers cannot choose pickup.</Hint>
          )}
        </Card>

        <Card>
          <Head title="Delivery" on={deliveryEnabled} onFlip={() => touch(setDeliveryEnabled)(!deliveryEnabled)} />
          {deliveryEnabled ? (
            <>
              <Label>Where you deliver, and the fee</Label>
              <div className="flex flex-col gap-2">
                {areas.map((a) => (
                  <div key={a.key} className="flex items-center gap-2">
                    <input
                      value={a.name}
                      onChange={(e) => touch(setAreas)(areas.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)))}
                      placeholder="Which area? Accra, East Legon, Tema..."
                      aria-label="Delivery area"
                      maxLength={40}
                      className="min-h-[44px] min-w-0 flex-1 rounded-control border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                    />
                    <label className="flex min-h-[44px] w-[120px] flex-none items-center gap-1.5 rounded-control border border-neutral-200 px-3 focus-within:border-teal">
                      <span className="text-[12.5px] font-semibold text-neutral-600">GHS</span>
                      <input
                        value={a.fee}
                        onChange={(e) => touch(setAreas)(areas.map((x) => (x.key === a.key ? { ...x, fee: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                        inputMode="decimal"
                        placeholder="30"
                        aria-label={`Delivery fee for ${a.name || "this area"}`}
                        className="num min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-neutral-500 focus:outline-none sm:text-[13.5px]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => touch(setAreas)(areas.filter((x) => x.key !== a.key))}
                      aria-label={`Remove ${a.name || "this area"}`}
                      className="tap flex h-11 w-10 flex-none items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
                {areas.length < 20 && (
                  <button
                    type="button"
                    onClick={() => touch(setAreas)([...areas, { key: nextKey++, name: "", fee: "" }])}
                    className="tap flex min-h-[44px] items-center gap-2 self-start rounded-control px-1 text-[13.5px] font-semibold text-teal-700"
                  >
                    <Icon name="plus" size={16} />
                    {areas.length ? "Add another area" : "Add a delivery area"}
                  </button>
                )}
              </div>
              <Hint>
                {areas.length
                  ? "Checkout asks which area and adds its fee to the order. Areas you do not list are not offered."
                  : "With no areas listed, delivery is offered everywhere and the cost is agreed on WhatsApp."}
              </Hint>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <Label>Same day if ordered before</Label>
                  <input
                    type="time"
                    value={cutoff}
                    onChange={(e) => touch(setCutoff)(e.target.value)}
                    className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink focus:border-teal focus:outline-none sm:text-[13.5px]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <Label>Who delivers</Label>
                  <input
                    value={deliveryNote}
                    onChange={(e) => touch(setDeliveryNote)(e.target.value)}
                    maxLength={160}
                    placeholder="Our own rider, or Bolt for far areas"
                    className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                  />
                </label>
              </div>
            </>
          ) : (
            <Hint>Customers cannot choose delivery.</Hint>
          )}
        </Card>

        <Card>
          <H2>Returns and contact</H2>
          <Label>Returns</Label>
          <div className="flex flex-wrap gap-1.5">
            {RETURNS.map(([v, l]) => (
              <Chip key={l} on={returnsDays === v} onClick={() => touch(setReturnsDays)(v)}>
                {l}
              </Chip>
            ))}
          </div>
          <Field label="Anything about returns" value={returnsNote} onChange={touch(setReturnsNote)} max={200} placeholder="Unopened items only, with the receipt" />
          <Field label="How customers reach you" value={contact} onChange={touch(setContact)} max={160} placeholder="WhatsApp 024 000 0000, open 8am to 8pm" />
        </Card>

        <Card>
          <H2>Promotion</H2>
          <Hint>One message at the top of your storefront. Leave the headline empty to show none.</Hint>
          <Field label="Headline" value={headline} onChange={touch(setHeadline)} max={60} placeholder="December bridal" />
          <Field label="One line about it" value={promoBody} onChange={touch(setPromoBody)} max={160} placeholder="Free wash and blow-dry with any bridal booking" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <Label>Link it to</Label>
              <select
                value={promoItem}
                onChange={(e) => touch(setPromoItem)(e.target.value)}
                className="min-h-[44px] w-full rounded-control border border-neutral-200 bg-white px-3 text-base text-ink focus:border-teal focus:outline-none sm:text-[13.5px]"
              >
                <option value="">Nothing, just the message</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.kind === "service" ? " (booking)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>Show it until</Label>
              <input
                type="date"
                min={today}
                value={promoUntil}
                onChange={(e) => touch(setPromoUntil)(e.target.value)}
                className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink focus:border-teal focus:outline-none sm:text-[13.5px]"
              />
            </label>
          </div>
        </Card>

        {error && (
          <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        )}
        <button type="button" onClick={save} disabled={busy || !dirty || !ready} className={`${primaryAction} min-h-[46px] justify-center disabled:opacity-60`}>
          {busy ? "Saving your shop settings..." : dirty ? "Save shop settings" : "Saved"}
        </button>
      </div>

      {/* What a customer reads, in the storefront's words */}
      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[88px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">What customers see</span>
          {shopUrl && (
            <a href={shopUrl} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[36px] px-3 text-[12.5px]`}>
              Open my storefront
            </a>
          )}
        </div>
        {promoLive(draft) && (
          // @contrast-ignore white on the deep navy ground (#0F172A), 17:1
          <div className="flex flex-col gap-1 rounded-[18px] bg-navy-deep px-4 py-4 text-white">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-mint-bright">{headline}</span>
            {promoBody && <span className="font-heading text-[16px] font-bold leading-snug">{promoBody}</span>}
            {promoItem && <span className="text-[12.5px] font-semibold text-teal-mint-bright">{items.find((i) => i.id === promoItem)?.kind === "service" ? "Book now" : "See it"}</span>}
          </div>
        )}
        <div className="flex flex-col rounded-[18px] border border-line-brand bg-white">
          {facts.pickup && <Fact icon="store" title={facts.pickup.title} detail={facts.pickup.detail} />}
          {facts.delivery && <Fact icon="send" title={facts.delivery.title} detail={facts.delivery.detail} />}
          {facts.returns && <Fact icon="swap" title="Returns" detail={facts.returns} />}
          {contact.trim() && <Fact icon="phone" title="Reach the shop" detail={contact.trim()} />}
        </div>
        {deliveryEnabled && draft.deliveryAreas.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
            <span className="text-[13px] font-bold text-ink">At checkout</span>
            {draft.deliveryAreas.map((a) => (
              <span key={a.name} className="flex justify-between text-[13px] text-neutral-700">
                <span>{a.name}</span>
                <span className="num font-semibold">{a.fee ? `GHS ${a.fee.toLocaleString("en-GH", { maximumFractionDigits: 2 })}` : "Free"}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <Toast message={toast.message} />
    </div>
  );
}

function Fact({ icon, title, detail }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0">
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-teal-50 text-teal-800">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13.5px] font-bold text-ink">{title}</span>
        <span className="text-[12.5px] text-neutral-600">{detail}</span>
      </span>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-panel border border-line-brand bg-white p-4 sm:p-[18px]">{children}</section>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-[16px] font-bold text-ink-heading">{children}</h2>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">{children}</span>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs leading-relaxed text-neutral-600">{children}</span>;
}
function Head({ title, on, onFlip }: { title: string; on: boolean; onFlip: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <H2>{title}</H2>
      <button type="button" role="switch" aria-checked={on} aria-label={`Offer ${title.toLowerCase()}`} onClick={onFlip} className="tap flex min-h-[44px] items-center gap-2 text-[12.5px] font-semibold text-neutral-700">
        {on ? "Offered" : "Not offered"}
        <span aria-hidden className={`flex h-[22px] w-[38px] flex-none items-center rounded-full p-0.5 ${on ? "justify-end bg-teal" : "justify-start bg-neutral-300"}`}>
          <span className="h-[18px] w-[18px] rounded-full bg-white shadow-sm" />
        </span>
      </button>
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`tap inline-flex min-h-[40px] items-center rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${on ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"}`}
    >
      {children}
    </button>
  );
}
function Field({ label, value, onChange, placeholder, max }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; max: number }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-neutral-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
      />
    </label>
  );
}
