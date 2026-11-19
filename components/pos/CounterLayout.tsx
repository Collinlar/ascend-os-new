"use client";

// The counter till, from the v3 Counter Register design: a big screen at a
// shop's counter, 1024px and wider. A navy bar says which till, who is on
// it and whether the sales have reached the office; a rail on the left;
// the products in the middle, found by scanning or typing; the sale on the
// right, always in view. Paying and the finished sale open over it.
//
// The engine is lib/pos/useTill.ts, the same one the handheld runs on, so a
// sale here is saved, queued and counted exactly as it is there.
//
// Left out until they are real: Sales and Returns on the rail (D4e), other
// ways to pay, a customer and a discount (D4d), the other devices' status in
// the bar, sending the receipt by WhatsApp or SMS.

import { useEffect, useMemo, useRef, useState } from "react";
import { formatGHS } from "@/lib/money";
import { statusText } from "@/lib/pos/outbox";
import { categoryTint, monogram, stockTone, tileSurface } from "@/lib/pos/tint";
import { KEYPAD, cents, clock, initials, likelyNotes, pressKey } from "@/lib/pos/cash";
import HeldSheet from "@/components/pos/HeldSheet";
import ScanSheet from "@/components/pos/ScanSheet";
import TillNotReady from "@/components/pos/TillNotReady";
import TileImage from "@/components/pos/TileImage";
import TillNotices from "@/components/pos/TillNotices";
import { Icon } from "@/components/shell/icons";
import type { Till } from "@/lib/pos/useTill";

export default function CounterLayout({ till, onCloseShift }: { till: Till; onCloseShift: () => void }) {
  const { ready, device, cashier, shift, held, status, lastReceipt, printNote, catalogue, cart, total, saving } = till;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [tendered, setTendered] = useState("");
  const [showHeld, setShowHeld] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const categories = useMemo(() => {
    const found = Array.from(new Set(catalogue.map((i) => i.category).filter(Boolean) as string[])).sort();
    return found.length > 0 ? ["All", ...found] : [];
  }, [catalogue]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || (item.barcode ?? "").toLowerCase().includes(q);
    });
  }, [catalogue, query, category]);

  const inCart = useMemo(() => new Map(cart.map((l) => [l.item.id, l.quantity])), [cart]);
  const items = cart.reduce((n, l) => n + l.quantity, 0);
  const paid = parseFloat(tendered) || 0;
  const enough = paid >= total && total > 0;
  const behind = status.kind === "needs_attention" || status.pending > 0;

  // A counter scanner types the barcode into the focused box and presses
  // Enter. An exact barcode goes straight into the sale; so does a search
  // that leaves exactly one product.
  function enter() {
    const q = query.trim();
    if (!q) return;
    const exact = catalogue.find((i) => (i.barcode ?? "") === q);
    const only = visibleItems.length === 1 ? visibleItems[0] : undefined;
    const item = exact ?? only;
    if (item && stockTone(item.localStock, item.lowStockThreshold) !== "out") {
      till.addToCart(item);
      setQuery("");
      setNotFound(null);
    } else if (!item) {
      setNotFound(q);
    }
  }

  async function finish() {
    if (await till.completeSale({ method: "cash", tendered: paid })) {
      setTendered("");
      setPaying(false);
      setDone(true);
    }
  }

  function nextSale() {
    setDone(false);
    search.current?.focus();
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-canvas text-ink">
      {/* @contrast-surface navy */}
      <header className="flex h-[60px] flex-none items-center gap-4 bg-navy px-5 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ascendsme-logo.webp" alt="AscendSME" width={120} height={22} className="h-[22px] w-auto brightness-0 invert" />
        <span aria-hidden className="h-[26px] w-px bg-white/15" />
        <span className="flex flex-col">
          <span className="font-heading text-[15px] font-bold">{device?.label ?? "Till"}</span>
          <span className="text-[12px] text-white/70">{shift ? `Shift open since ${clock(shift.openedAt)}` : "Ascend POS"}</span>
        </span>
        <span className="flex-1" />
        <button
          onClick={till.syncNow}
          className={`tap flex items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold ${
            behind ? "bg-gold-500 text-ink" : "bg-white/10 text-teal-mint-bright"
          }`}
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${behind ? "bg-ink" : "bg-teal-mint-bright"}`} />
          {statusText(status)}
        </button>
        <span aria-hidden className="h-[26px] w-px bg-white/15" />
        {cashier && (
          <span className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-teal-bright text-[12.5px] font-bold text-teal-deepest">
              {initials(cashier.displayName)}
            </span>
            <span className="text-[13.5px] font-semibold">{cashier.displayName}</span>
          </span>
        )}
        <span className="num pl-1.5 font-heading text-[18px] font-bold">{clock(now)}</span>
      </header>

      {/* @contrast-surface white */}
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[92px] flex-none flex-col items-center gap-1.5 border-r border-neutral-100 bg-white py-3.5" aria-label="Till">
          <span className="flex h-[72px] w-[76px] flex-col items-center justify-center gap-1.5 rounded-card bg-teal-50 text-[12px] font-semibold text-teal-700">
            <Icon name="sell" size={22} />
            Sell
          </span>
          <button
            onClick={onCloseShift}
            className="tap flex h-[72px] w-[76px] flex-col items-center justify-center gap-1.5 rounded-card text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Icon name="money" size={22} />
            Shift
          </button>
          <span className="flex-1" />
          <button
            onClick={async () => {
              await till.handOver();
              setPaying(false);
              setDone(false);
            }}
            className="tap flex h-[72px] w-[76px] flex-col items-center justify-center gap-1.5 rounded-card text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Icon name="shield" size={22} />
            Lock
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <TillNotices till={till} />

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col gap-3.5 py-5 pl-6 pr-5">
              <div className="flex gap-2.5">
                <label className="flex h-[58px] flex-1 items-center gap-3 rounded-card border-2 border-line-brand bg-white px-4 text-neutral-500 focus-within:border-teal">
                  <Icon name="search" size={20} />
                  <input
                    ref={search}
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setNotFound(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") enter();
                    }}
                    placeholder="Scan a barcode, or type a product name"
                    aria-label="Scan a barcode, or type a product name"
                    className="min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-neutral-500 focus:outline-none"
                  />
                </label>
                <button
                  onClick={() => setScanning(true)}
                  className="tap flex h-[58px] items-center gap-2 rounded-card border-[1.5px] border-line-brand bg-white px-[18px] text-[14px] font-semibold text-teal-800 hover:bg-teal-50"
                >
                  Use the camera
                </button>
              </div>
              {notFound && (
                <p className="-mt-1.5 text-[13.5px] font-semibold text-gold-700">
                  Nothing on this till has the code {notFound}. Check the code, or add the product on Ascend.
                </p>
              )}
              {categories.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      aria-pressed={category === cat}
                      className={`tap flex items-center rounded-full border-[1.5px] px-4 text-[14px] font-semibold ${
                        category === cat ? "border-teal bg-teal text-white" : "border-line-brand bg-white text-neutral-700"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <section className="grid min-h-0 flex-1 auto-rows-max grid-cols-3 gap-3 overflow-y-auto pb-1 xl:grid-cols-4">
                {!ready && <p className="col-span-full py-16 text-center text-neutral-500">Opening your till...</p>}
                {ready && catalogue.length === 0 && (
                  <div className="col-span-full">
                    <TillNotReady light reason="no_products" businessLabel={device?.label} onRetry={till.retryCatalogue} />
                  </div>
                )}
                {ready && catalogue.length > 0 && visibleItems.length === 0 && (
                  <p className="col-span-full py-16 text-center text-[14px] text-neutral-500">
                    Nothing matches that. Clear the search to see everything.
                  </p>
                )}
                {ready &&
                  visibleItems.map((item) => {
                    const [, tintInk] = categoryTint(item.category);
                    const tone = stockTone(item.localStock, item.lowStockThreshold);
                    const soldOut = tone === "out";
                    const qty = inCart.get(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => !soldOut && till.addToCart(item)}
                        disabled={soldOut}
                        className={`tap relative flex flex-col gap-2 rounded-[18px] border-[1.5px] bg-white p-2 pb-3 text-left hover:border-teal disabled:opacity-50 ${
                          qty ? "border-teal" : "border-line-brand"
                        }`}
                      >
                        <span className="relative flex h-[92px] w-full items-center justify-center overflow-hidden rounded-control" style={tileSurface(item.category)}>
                          {item.photoUrl ? (
                            <TileImage url={item.photoUrl} className="h-full w-full object-contain p-1" />
                          ) : (
                            <span className="text-[24px] font-extrabold tracking-[-0.02em]" style={{ color: tintInk }}>
                              {monogram(item.name)}
                            </span>
                          )}
                          {qty && (
                            <span className="absolute right-2 top-2 flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-teal px-1.5 text-[13px] font-bold text-white">
                              {qty}
                            </span>
                          )}
                        </span>
                        <span className="line-clamp-2 px-1 text-[14.5px] font-semibold leading-snug text-ink">{item.name}</span>
                        <span className="mt-auto flex items-baseline justify-between px-1">
                          <span className="num font-heading text-[16px] font-bold text-ink-heading">{formatGHS(item.price)}</span>
                          {item.trackStock && item.localStock !== undefined && (
                            <span
                              className={`num text-[12px] font-semibold ${soldOut ? "text-danger-ink" : tone === "low" ? "text-gold-700" : "text-neutral-500"}`}
                            >
                              {soldOut ? "None left" : `${item.localStock} left`}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
              </section>
            </div>

            <aside className="flex w-[400px] flex-none flex-col border-l border-neutral-100 bg-white xl:w-[440px]" aria-label="This sale">
              <div className="flex flex-none items-center justify-between px-5 pb-3 pt-4">
                <span className="flex flex-col">
                  <span className="font-heading text-[19px] font-extrabold text-ink-heading">This sale</span>
                  <span className="text-[12.5px] text-neutral-500">
                    {items === 0 ? "Nothing in it yet" : `${items} item${items === 1 ? "" : "s"}`}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {held.length > 0 && (
                    <button
                      onClick={() => setShowHeld(true)}
                      className="tap flex items-center rounded-control bg-gold-100 px-3 text-[12.5px] font-bold text-gold-700"
                    >
                      {held.length} parked
                    </button>
                  )}
                  {cart.length > 0 && (
                    <button
                      onClick={till.clearCart}
                      className="tap flex items-center rounded-control px-3 text-[12.5px] font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      Clear the sale
                    </button>
                  )}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center gap-2.5 px-8 py-[70px] text-center">
                    <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-teal-50 text-teal-700">
                      <Icon name="sell" size={26} />
                    </span>
                    <span className="font-heading text-[17px] font-bold text-ink-heading">Ready for the next customer</span>
                    <span className="text-[13.5px] text-neutral-600">Scan an item or tap a product to start.</span>
                  </div>
                ) : (
                  cart.map((line) => {
                    const [, tintInk] = categoryTint(line.item.category);
                    return (
                      <div key={line.item.id} className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3">
                        <span
                          aria-hidden
                          className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-[12px] font-extrabold"
                          style={{ ...tileSurface(line.item.category), color: tintInk }}
                        >
                          {monogram(line.item.name)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px] font-semibold text-ink">{line.item.name}</span>
                          <span className="num text-[12px] text-neutral-500">{formatGHS(line.item.price)} each</span>
                        </span>
                        <span className="flex h-11 flex-none items-center rounded-control border-[1.5px] border-neutral-200">
                          <button
                            onClick={() => till.setQuantity(line.item.id, line.quantity - 1)}
                            aria-label={`One less ${line.item.name}`}
                            className="flex h-full w-9 items-center justify-center text-[20px] font-bold text-neutral-700"
                          >
                            −
                          </button>
                          <span className="num min-w-[26px] text-center text-[15px] font-bold">{line.quantity}</span>
                          <button
                            onClick={() => till.setQuantity(line.item.id, line.quantity + 1)}
                            aria-label={`One more ${line.item.name}`}
                            className="flex h-full w-9 items-center justify-center text-teal-700"
                          >
                            <Icon name="plus" size={18} />
                          </button>
                        </span>
                        <span className="num w-[86px] flex-none text-right text-[14.5px] font-bold">
                          {formatGHS(cents(line.item.price * line.quantity))}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex flex-none flex-col gap-2 border-t border-neutral-100 px-5 pb-[18px] pt-3.5">
                <div className="flex items-baseline justify-between border-dashed pt-1">
                  <span className="font-heading text-[17px] font-bold text-ink-heading">Total</span>
                  <span className="num font-heading text-[30px] font-extrabold tracking-[-0.02em] text-ink-heading">{formatGHS(total)}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={till.parkSale}
                    disabled={cart.length === 0}
                    className="tap flex h-16 w-24 flex-none items-center justify-center rounded-card border-[1.5px] border-neutral-200 text-[13px] font-bold text-neutral-700 disabled:opacity-40"
                  >
                    Park it
                  </button>
                  <button
                    onClick={() => {
                      setTendered("");
                      setPaying(true);
                    }}
                    disabled={cart.length === 0}
                    className="tap num flex h-16 flex-1 items-center justify-center rounded-card bg-teal font-heading text-[19px] font-extrabold text-white shadow-[0_12px_26px_rgba(0,122,111,0.25)] disabled:opacity-40 disabled:shadow-none"
                  >
                    Charge {formatGHS(total)}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {paying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/55 p-6" role="dialog" aria-modal aria-label="Take payment">
          <div className="flex h-[min(740px,100%)] w-[min(1120px,100%)] overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex w-[330px] flex-none flex-col gap-4 bg-canvas p-6">
              <button
                onClick={() => setPaying(false)}
                className="tap flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-neutral-600"
              >
                <span className="rotate-180">
                  <Icon name="chev" size={16} />
                </span>
                Back to the sale
              </button>
              <span className="flex flex-col">
                <span className="text-[12.5px] text-neutral-500">To pay, in cash</span>
                <span className="num font-heading text-[44px] font-extrabold tracking-[-0.02em] text-ink-heading">{formatGHS(total)}</span>
              </span>
              <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-200">
                {cart.map((l) => (
                  <div key={l.item.id} className="flex justify-between gap-2.5 border-b border-neutral-100 py-2.5 text-[13.5px]">
                    <span>
                      {l.quantity} × {l.item.name}
                    </span>
                    <span className="num font-semibold">{formatGHS(cents(l.item.price * l.quantity))}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-5 px-7 py-6">
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-6">
                <div className="flex flex-col gap-3.5">
                  <span className="flex flex-col">
                    <span className="text-[13px] text-neutral-500">Cash received</span>
                    <span className={`num font-heading text-[46px] font-extrabold tracking-[-0.02em] ${tendered ? "text-ink-heading" : "text-neutral-500"}`}>
                      {formatGHS(paid)}
                    </span>
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {likelyNotes(total).map((n, i) => (
                      <button
                        key={n}
                        onClick={() => setTendered(String(n))}
                        className={`tap num h-14 rounded-[14px] border-[1.5px] text-[16px] font-bold ${
                          paid === n ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-ink"
                        }`}
                      >
                        {i === 0 ? `Exact, ${formatGHS(n)}` : formatGHS(n)}
                      </button>
                    ))}
                  </div>
                  <div
                    className={`mt-auto flex items-center justify-between rounded-[18px] px-[18px] py-4 ${
                      !tendered ? "bg-neutral-50 text-neutral-600" : enough ? "bg-success-tint text-success-ink" : "bg-gold-100 text-gold-700"
                    }`}
                  >
                    <span className="font-heading text-[17px] font-bold">{enough || !tendered ? "Change" : "Still to pay"}</span>
                    <span className="num font-heading text-[34px] font-extrabold">
                      {formatGHS(enough ? cents(paid - total) : tendered ? cents(total - paid) : 0)}
                    </span>
                  </div>
                </div>
                <div className="grid auto-rows-fr grid-cols-3 gap-2">
                  {KEYPAD.map((k) => (
                    <button
                      key={k}
                      onClick={() => setTendered((t) => pressKey(t, k))}
                      aria-label={k === "back" ? "Delete the last digit" : k === "." ? "Decimal point" : k}
                      className="tap flex items-center justify-center rounded-[14px] bg-neutral-50 font-heading text-[24px] font-bold text-ink active:bg-teal-50"
                    >
                      {k === "back" ? "←" : k}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={finish}
                disabled={!enough || saving}
                className="tap num flex h-16 flex-none items-center justify-center rounded-[18px] bg-teal font-heading text-[19px] font-extrabold text-white disabled:opacity-40"
              >
                {saving ? "Saving the sale on this till..." : enough ? `Take ${formatGHS(paid)} cash` : "Enter what they gave you"}
              </button>
            </div>
          </div>
        </div>
      )}

      {done && lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/55 p-6" role="dialog" aria-modal aria-label="Sale complete">
          <div className="flex h-[min(680px,100%)] w-[min(1000px,100%)] overflow-hidden rounded-[28px] bg-white shadow-2xl">
            {/* The receipt as it went to the printer. */}
            <div className="flex w-[400px] flex-none justify-center overflow-y-auto bg-neutral-50 p-7">
              <div className="mono flex w-[320px] flex-col gap-2.5 self-start bg-white px-5 pb-6 pt-5 text-[12px] leading-relaxed text-ink shadow-[0_8px_24px_rgba(2,60,55,0.08)]">
                <span className="text-center font-heading text-[16px] font-extrabold">{lastReceipt.doc.businessName}</span>
                <span className="border-t-[1.5px] border-dashed border-neutral-300" />
                <span className="flex justify-between">
                  <span>Receipt</span>
                  <span>{lastReceipt.number}</span>
                </span>
                {lastReceipt.doc.cashierName && (
                  <span className="flex justify-between">
                    <span>Served by</span>
                    <span>{lastReceipt.doc.cashierName}</span>
                  </span>
                )}
                <span className="border-t-[1.5px] border-dashed border-neutral-300" />
                {lastReceipt.doc.lines.map((l, i) => (
                  <span key={i} className="flex flex-col">
                    <span>{l.name}</span>
                    <span className="flex justify-between text-neutral-600">
                      <span>
                        {l.quantity} x {formatGHS(l.unitPrice)}
                      </span>
                      <span className="text-ink">{formatGHS(l.amount)}</span>
                    </span>
                  </span>
                ))}
                <span className="border-t-[1.5px] border-dashed border-neutral-300" />
                <span className="flex justify-between text-[13.5px] font-bold">
                  <span>Total</span>
                  <span>{formatGHS(lastReceipt.doc.total)}</span>
                </span>
                <span className="flex justify-between">
                  <span>Cash</span>
                  <span>{formatGHS(lastReceipt.doc.tendered ?? lastReceipt.doc.total)}</span>
                </span>
                <span className="flex justify-between">
                  <span>Change</span>
                  <span>{formatGHS(lastReceipt.doc.change ?? 0)}</span>
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-5 px-8 pb-7 pt-8">
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-success-tint text-success-ink">
                <Icon name="check" size={34} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-heading text-[30px] font-extrabold text-ink-heading">Sale complete</span>
                <span className="mono text-[14px] text-neutral-600">
                  {lastReceipt.number} · {formatGHS(lastReceipt.total)} cash
                </span>
              </span>
              {/* @contrast-surface navy */}
              {(lastReceipt.doc.change ?? 0) > 0 && (
                <div className="flex items-center justify-between rounded-[20px] bg-navy px-[22px] py-[18px] text-white">
                  <span className="font-heading text-[18px] font-bold">Give change</span>
                  <span className="num font-heading text-[40px] font-extrabold text-teal-mint-bright">{formatGHS(lastReceipt.doc.change ?? 0)}</span>
                </div>
              )}
              {/* @contrast-surface white */}
              <div className={`flex items-center gap-3 rounded-[14px] p-3.5 ${printNote ? "bg-gold-100 text-gold-700" : "bg-neutral-50 text-ink"}`}>
                <span className="flex flex-1 flex-col">
                  <span className="text-[14px] font-bold">{printNote ? "The receipt did not print" : "Receipt sent to the printer"}</span>
                  <span className="text-[12.5px]">{printNote ?? "The sale is saved either way."}</span>
                </span>
                <button
                  onClick={() => till.printReceipt(lastReceipt.doc)}
                  className="tap flex items-center rounded-control px-3 text-[13.5px] font-bold text-teal-700"
                >
                  Print again
                </button>
              </div>
              <p className="flex items-center gap-2 text-[13px] text-neutral-600">
                <span className={behind ? "text-gold-700" : "text-success-ink"}>
                  <Icon name={behind ? "clock" : "check"} size={16} />
                </span>
                {behind ? "Saved on this till. It sends itself when the network is back." : "Saved, and sent to the office."}
              </p>
              <span className="flex-1" />
              <button
                autoFocus
                onClick={nextSale}
                className="tap flex h-[66px] items-center justify-center rounded-[18px] bg-teal font-heading text-[19px] font-extrabold text-white"
              >
                Start the next sale
              </button>
            </div>
          </div>
        </div>
      )}

      {scanning && (
        <ScanSheet catalogue={catalogue} onAdd={till.addToCart} onAttach={till.attachBarcode} onClose={() => setScanning(false)} />
      )}

      {showHeld && (
        <HeldSheet
          held={held}
          onResume={async (id) => {
            if (await till.bringBack(id)) setShowHeld(false);
          }}
          onDiscard={till.throwAway}
          onClose={() => setShowHeld(false)}
        />
      )}
    </main>
  );
}
