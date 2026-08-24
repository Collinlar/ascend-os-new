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
  products: StorefrontProduct[];
}

type View = "browse" | "product" | "basket" | "checkout" | "placed";

export default function Storefront({ slug, businessName, city, products }: Props) {
  const [view, setView] = useState<View>("browse");
  const [openId, setOpenId] = useState<string | null>(null);
  const [basket, setBasket] = useState<Record<string, number>>({});

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfilment, setFulfilment] = useState<Fulfilment>("pickup");
  const [address, setAddress] = useState("");

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ orderId: string | null; total: number | null } | null>(
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
        .map(([id, quantity]) => {
          const product = byId.get(id);
          return product ? { product, quantity } : null;
        })
        .filter((l): l is BasketLine => l !== null),
    [basket, byId]
  );

  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.product.price * l.quantity, 0);

  // Every screen change is a new page as far as the customer is concerned,
  // so it starts at the top. Without this, opening a product from halfway
  // down the grid lands you halfway down the product.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view, openId]);

  function setQuantity(productId: string, quantity: number) {
    setBasket((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });
  }

  function add(product: StorefrontProduct, quantity = 1) {
    setQuantity(product.id, (basket[product.id] ?? 0) + quantity);
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
          lines: lines.map((l) => ({ itemId: l.product.id, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not place your order just now. Tap again.");
        return;
      }
      setPlaced({ orderId: data.orderId ?? null, total: data.total ?? null });
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
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-11">
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
                  stroke="#33506A"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="19" r="1.4" fill="#33506A" />
                <circle cx="16.5" cy="19" r="1.4" fill="#33506A" />
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
          businessName={businessName}
          city={city}
          products={products}
          basket={basket}
          onOpen={(p) => {
            setOpenId(p.id);
            setView("product");
          }}
          onAdd={(p) => add(p)}
        />
      )}

      {view === "product" && open && (
        <ProductDetail
          product={open}
          inBasket={basket[open.id] ?? 0}
          onBack={() => setView("browse")}
          onAdd={(quantity) => {
            add(open, quantity);
            setView("basket");
          }}
        />
      )}

      {view === "basket" && (
        <Basket
          lines={lines}
          subtotal={subtotal}
          onBack={() => setView("browse")}
          onSetQuantity={setQuantity}
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
          placing={placing}
          error={error}
          onBack={() => setView("basket")}
          onChange={(patch) => {
            if (patch.customerName !== undefined) setCustomerName(patch.customerName);
            if (patch.phone !== undefined) setPhone(patch.phone);
            if (patch.fulfilment !== undefined) setFulfilment(patch.fulfilment);
            if (patch.address !== undefined) setAddress(patch.address);
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

      <footer className="border-t border-line bg-surface px-5 py-6 sm:px-11">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-slate-grey">
            © {new Date().getFullYear()} {businessName}
          </p>
          <p className="text-[13px] font-semibold text-slate-grey">
            Powered by Ascend Shop
          </p>
        </div>
      </footer>
    </div>
  );
}
