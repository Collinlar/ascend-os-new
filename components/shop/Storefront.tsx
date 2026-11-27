"use client";

import { useEffect, useMemo, useState } from "react";
import { formatGHS } from "@/lib/money";
import { newClientRef } from "@/lib/ids";
import Basket, { type BasketLine } from "./Basket";
import Checkout, { type Fulfilment } from "./Checkout";
import OrderPlaced from "./OrderPlaced";
import ProductDetail from "./ProductDetail";
import StoreBrowse from "./StoreBrowse";
import { initials, type StorefrontProduct } from "./storefront-parts";
import { DEFAULT_SETTINGS, fulfilmentFacts, type ShopSettings } from "@/lib/shop/settings";
import { discoverRef, takeDiscoverRef } from "@/lib/discover/ref";

export type { StorefrontProduct } from "./storefront-parts";

// Customer Web storefront. One shop, one page, no account.
//
// The basket is a claim and nothing more: the server re-prices every line
// at placement, so a stale page or an edited request cannot change what an
// order costs. What is held here is only which items and how many.

interface Props {
  slug: string;
  businessName: string;
  city: string | null;
  memberSince: string | null;
  places: { id: string; name: string; city: string | null; address?: string | null }[];
  products: StorefrontProduct[];
  /** Ascend has verified who runs it (Modules M6b). */
  verified?: boolean;
  /** It takes bookings on its booking page too. */
  bookable?: boolean;
  /** Pickup, delivery, returns, contact and the promotion (round 2, R3). */
  settings?: ShopSettings;
  promoLink?: { kind: "product" | "service"; id: string } | null;
  services?: Array<{ id: string; name: string; price: number; minutes: number | null; deposit: number | null }>;
  serviceCount?: number;
}

type View = "browse" | "product" | "basket" | "checkout" | "placed";

export default function Storefront({ slug, businessName, city, memberSince, places, products, verified = false, bookable = false, settings = DEFAULT_SETTINGS, promoLink = null, services = [], serviceCount = 0 }: Props) {
  const [view, setView] = useState<View>("browse");
  // The aisle being browsed, also picked from the laptop header (round 4, S1).
  const [category, setCategory] = useState<string | null>(null);
  const topCategories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of products) if (p.category) seen.set(p.category, (seen.get(p.category) ?? 0) + 1);
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [products]);
  const strip = fulfilmentFacts(settings, places.length > 1 ? places.map((p) => p.name) : []);
  const [openId, setOpenId] = useState<string | null>(null);
  // Keyed by line: the product id, or "product:size" for a product with
  // sizes, so 250ml and 500ml of one product are two lines (round 2, R4).
  const [basket, setBasket] = useState<Record<string, number>>({});

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfilment, setFulfilment] = useState<Fulfilment>(settings.pickupEnabled ? "pickup" : "merchant_delivery");
  const [address, setAddress] = useState("");
  // The delivery area the customer picks; its fee is the shop's (R3).
  const [area, setArea] = useState(settings.deliveryAreas.length === 1 ? settings.deliveryAreas[0].name : "");
  // Where to collect, when the shop has more than one place (R4).
  const [placeId, setPlaceId] = useState<string>(places[0]?.id ?? "");
  // GhanaPost GPS or a landmark, for delivery (R4).
  const [gps, setGps] = useState("");
  // Offers on WhatsApp: unticked until the customer ticks it (R4).
  const [offers, setOffers] = useState(false);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ orderId: string | null; total: number | null; deliveryFee?: number | null; trackPath?: string | null } | null>(
    null
  );
  // One reference for the whole visit, so a customer who taps twice or
  // loses signal mid-request gets one order rather than two.
  const [clientRef] = useState(() => newClientRef("order"));

  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const lines: BasketLine[] = useMemo(
    () =>
      Object.entries(basket)
        .map(([key, quantity]) => {
          const [id, sizeId] = key.split(":");
          const product = byId.get(id);
          if (!product) return null;
          const size = sizeId ? product.sizes?.find((z) => z.id === sizeId) ?? null : null;
          if (sizeId && !size) return null;
          return { key, product, size, quantity, price: size?.price ?? product.price };
        })
        .filter((l): l is BasketLine => l !== null),
    [basket, byId]
  );
  // How many of each product, whatever the size: sizes share its stock.
  const perItem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) m[l.product.id] = (m[l.product.id] ?? 0) + l.quantity;
    return m;
  }, [lines]);

  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);
  // Shown here; charged by the server from the same settings.
  const deliveryFee =
    fulfilment === "merchant_delivery" ? settings.deliveryAreas.find((a) => a.name === area)?.fee ?? null : 0;

  // Every screen change is a new page as far as the customer is concerned,
  // so it starts at the top. Without this, opening a product from halfway
  // down the grid lands you halfway down the product.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view, openId]);

  // A Discover click brought them here: count the visit for the promotion
  // (round 3, P1). Silent, and never in the way.
  useEffect(() => {
    const ref = takeDiscoverRef(slug);
    if (!ref) return;
    fetch("/api/discover/attribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, slug }),
      keepalive: true,
    }).catch(() => null);
  }, [slug]);

  function setQuantity(key: string, wanted: number) {
    // Never more in the basket than the shop has left of a counted product,
    // across all its sizes.
    const productId = key.split(":")[0];
    const left = byId.get(productId)?.left;
    const others = (perItem[productId] ?? 0) - (basket[key] ?? 0);
    const quantity = left === undefined ? wanted : Math.min(wanted, Math.max(0, left - others));
    setBasket((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[key];
      else next[key] = quantity;
      return next;
    });
  }

  function add(product: StorefrontProduct, quantity = 1, sizeId?: string) {
    const key = sizeId ? `${product.id}:${sizeId}` : product.id;
    setQuantity(key, (basket[key] ?? 0) + quantity);
  }

  async function placeOrder() {
    if (placing) return;
    setError(null);
    setPlacing(true);
    try {
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          clientRef,
          customerName,
          customerPhone: phone,
          fulfilment,
          deliveryAddress: address,
          deliveryArea: fulfilment === "merchant_delivery" ? area : undefined,
          deliveryGps: fulfilment === "merchant_delivery" ? gps : undefined,
          locationId: fulfilment === "pickup" && places.length > 1 ? placeId : undefined,
          marketingOptIn: offers,
          discoverRef: discoverRef(slug),
          lines: lines.map((l) => ({ itemId: l.product.id, variantId: l.size?.id, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not place your order just now. Tap again.");
        return;
      }
      setPlaced({
        orderId: data.orderId ?? null,
        total: data.total ?? null,
        // Only a fee the shop's settings set; otherwise it is still agreed on WhatsApp.
        deliveryFee: settings.deliveryAreas.length > 0 ? Number(data.deliveryFee ?? 0) : null,
        trackPath: typeof data.trackPath === "string" ? data.trackPath : null,
      });
      setView("placed");
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setPlacing(false);
    }
  }

  function startAgain() {
    setBasket({});
    setPlaced(null);
    setView("browse");
  }

  const open = openId ? byId.get(openId) ?? null : null;

  return (
    <div className="min-h-screen bg-white">
      {/* Identity strip. Stays on every screen so a customer four taps deep
          still knows whose shop they are in, which is the whole job of a
          page somebody reached from a forwarded link. */}
      {/* On a laptop, how it reaches you, said across the top (round 4, S1). */}
      {settings.saved && (strip.pickup || strip.delivery) && (
        <div className="hidden bg-teal-50 lg:block">
          <p className="mx-auto flex max-w-[1280px] items-center justify-center gap-3 px-8 py-2 text-[12.5px] font-semibold text-teal-800">
            {[strip.pickup ? `${strip.pickup.title}: ${strip.pickup.detail}` : null, strip.delivery ? `${strip.delivery.title}: ${strip.delivery.detail}` : null, "Pay on the day"]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <button
            type="button"
            onClick={() => (view === "placed" ? startAgain() : setView("browse"))}
            aria-label={`${businessName}, back to the shop front`}
            className="flex min-w-0 items-center gap-2.5 text-left"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-control bg-teal-light text-sm font-extrabold text-teal-dark">
              {initials(businessName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-extrabold tracking-[-0.01em] text-ink">
                {businessName}
              </span>
              <span className="block truncate text-[11.5px] font-medium text-slate-grey">
                {city ? `${city} · Order online` : "Order online"}
              </span>
            </span>
          </button>

          {/* The laptop's own way around the shop (round 4, S1). */}
          <nav aria-label={`${businessName} shop`} className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            <button
              type="button"
              onClick={() => {
                setCategory(null);
                setView("browse");
              }}
              className="tap rounded-full px-3.5 py-2 text-[14px] font-semibold text-ink hover:bg-teal-50"
            >
              Shop all
            </button>
            {topCategories.slice(0, 3).map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setCategory(c.name);
                  setView("browse");
                }}
                aria-pressed={category === c.name}
                className={`tap rounded-full px-3.5 py-2 text-[14px] font-semibold hover:bg-teal-50 ${category === c.name ? "bg-teal-50 text-teal-800" : "text-ink"}`}
              >
                {c.name}
              </button>
            ))}
            {bookable && (
              <a href={`/b/${slug}`} className="tap rounded-full px-3.5 py-2 text-[14px] font-semibold text-ink hover:bg-teal-50">
                Book a service
              </a>
            )}
          </nav>
          <a href={`/s/${slug}/track`} className="tap hidden min-h-[44px] flex-none items-center rounded-control px-3 text-[14px] font-semibold text-teal-dark hover:bg-teal-50 lg:flex">
            Track order
          </a>

          {view !== "placed" && (
            <button
              type="button"
              onClick={() => setView("basket")}
              aria-label={
                itemCount > 0
                  ? `Your basket, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
                  : "Your basket, empty"
              }
              className="tap relative flex h-11 w-11 flex-none items-center justify-center rounded-control border border-line bg-surface"
            >
              <svg width="19" height="19" viewBox="0 0 22 22" fill="none" aria-hidden>
                <path
                  d="M3 3h2l1.5 11.5a1.5 1.5 0 0 0 1.5 1.3h8.3a1.5 1.5 0 0 0 1.5-1.2L19 7H6"
                  stroke="#374151"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="19" r="1.4" fill="#374151" />
                <circle cx="16.5" cy="19" r="1.4" fill="#374151" />
              </svg>
              {itemCount > 0 && (
                <span className="num absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-teal px-1 text-[10px] font-extrabold text-white">
                  {itemCount}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {view === "browse" && (
        <StoreBrowse
          slug={slug}
          businessName={businessName}
          city={city}
          memberSince={memberSince}
          places={places}
          products={products}
          verified={verified}
          bookable={bookable}
          settings={settings}
          promoLink={promoLink}
          services={services}
          serviceCount={serviceCount}
          category={category}
          onCategory={setCategory}
          basket={perItem}
          onOpen={(p) => {
            setOpenId(p.id);
            setView("product");
          }}
          // A product with sizes opens, so the customer picks one first.
          onAdd={(p) => {
            if (p.sizes?.length) {
              setOpenId(p.id);
              setView("product");
            } else add(p);
          }}
        />
      )}

      {view === "product" && open && (
        <ProductDetail
          key={open.id}
          product={open}
          inBasket={perItem[open.id] ?? 0}
          businessName={businessName}
          slug={slug}
          settings={settings}
          places={places.map((p) => p.name)}
          suggestions={(open.goesWith ?? []).map((id) => byId.get(id)).filter((p): p is StorefrontProduct => Boolean(p) && p!.left !== 0).slice(0, 4)}
          onOpenOther={(p) => setOpenId(p.id)}
          onAdd={(quantity, sizeId) => {
            add(open, quantity, sizeId);
            setView("basket");
          }}
          onBuyNow={(quantity, sizeId) => {
            add(open, quantity, sizeId);
            setView("checkout");
          }}
          onBack={() => setView("browse")}
        />
      )}

      {view === "basket" && (
        <Basket
          lines={lines}
          subtotal={subtotal}
          onBack={() => setView("browse")}
          onSetQuantity={setQuantity}
          settings={settings}
          suggestions={(() => {
            // Goes well with: what is bought with what is in the basket,
            // not already in it, and not sold out.
            const inBasket = new Set(lines.map((l) => l.product.id));
            const score = new Map<string, number>();
            for (const l of lines) (l.product.goesWith ?? []).forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 4 - i));
            return Array.from(score.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([id]) => byId.get(id))
              .filter((p): p is StorefrontProduct => Boolean(p) && !inBasket.has(p!.id) && p!.left !== 0)
              .slice(0, 3);
          })()}
          onOpen={(p) => {
            setOpenId(p.id);
            setView("product");
          }}
          onAdd={(p) => (p.sizes?.length ? (setOpenId(p.id), setView("product")) : add(p))}
          onCheckout={() => setView("checkout")}
        />
      )}

      {view === "checkout" && (
        <Checkout
          businessName={businessName}
          itemCount={itemCount}
          subtotal={subtotal}
          customerName={customerName}
          phone={phone}
          fulfilment={fulfilment}
          address={address}
          settings={settings}
          places={places.map((p) => p.name)}
          placeOptions={places}
          placeId={placeId}
          gps={gps}
          offers={offers}
          area={area}
          deliveryFee={deliveryFee}
          placing={placing}
          error={error}
          onBack={() => setView("basket")}
          onChange={(patch) => {
            if (patch.customerName !== undefined) setCustomerName(patch.customerName);
            if (patch.phone !== undefined) setPhone(patch.phone);
            if (patch.fulfilment !== undefined) setFulfilment(patch.fulfilment);
            if (patch.address !== undefined) setAddress(patch.address);
            if (patch.area !== undefined) setArea(patch.area);
            if (patch.placeId !== undefined) setPlaceId(patch.placeId);
            if (patch.gps !== undefined) setGps(patch.gps);
            if (patch.offers !== undefined) setOffers(patch.offers);
          }}
          onPlace={placeOrder}
        />
      )}

      {view === "placed" && (
        <OrderPlaced
          businessName={businessName}
          orderId={placed?.orderId ?? null}
          total={placed?.total ?? null}
          phone={phone}
          delivering={fulfilment === "merchant_delivery"}
          deliveryFee={placed?.deliveryFee ?? null}
          trackPath={placed?.trackPath ?? null}
          onBack={startAgain}
        />
      )}

      {/* Basket bar, only while browsing and only once there is something
          in it. A customer three items deep should be able to act without
          finding the icon at the top. */}
      {view === "browse" && itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setView("basket")}
            className="tap mx-auto flex w-full max-w-2xl items-center justify-between rounded-panel bg-teal px-6 font-bold text-white shadow-action"
          >
            <span>
              See my basket · {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="num">{formatGHS(subtotal)}</span>
          </button>
        </div>
      )}

      <footer className="border-t border-neutral-100 bg-white px-4 py-8 sm:px-8">
        {/* Who they are, where to find them, and how buying works: only
            what Ascend holds (round 4, S1). Opening hours wait until
            Ascend keeps them. */}
        <div className="mx-auto grid max-w-[1280px] gap-6 text-[13.5px] sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <p className="font-heading text-[16px] font-bold text-ink-heading">{businessName}</p>
            {verified && <p className="font-semibold text-teal-800">Business verified by AscendSME</p>}
          </div>
          {places.some((p) => p.address || p.city) && (
            <div className="flex flex-col gap-1.5">
              <p className="font-bold text-ink">Visit us</p>
              {places.map((p) => (
                <p key={p.id} className="text-slate-grey">
                  {[p.address, p.name, p.city].filter(Boolean).join(", ")}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <p className="font-bold text-ink">Help</p>
            {settings.saved && strip.pickup && <p className="text-slate-grey">{strip.pickup.title}: {strip.pickup.detail}</p>}
            {settings.saved && strip.delivery && <p className="text-slate-grey">{strip.delivery.title}: {strip.delivery.detail}</p>}
            {settings.saved && strip.returns && <p className="text-slate-grey">{strip.returns}</p>}
            <a href={`/s/${slug}/track`} className="tap self-start font-semibold text-teal-dark">Track an order</a>
            {settings.contactLine && <p className="text-slate-grey">{settings.contactLine}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-bold text-ink">Paying</p>
            <p className="text-slate-grey">You pay {businessName} when you collect your order or it reaches you. Nothing is taken online.</p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-[1280px] border-t border-neutral-100 pt-4 text-[12.5px] font-semibold text-slate-grey">
          Shop powered by AscendSME · {businessName} sells and fulfils every order
        </p>
      </footer>
    </div>
  );
}
