"use client";

// The handheld till, from the v3 Smart Terminal design: a light screen, one
// job per screen. Sell (find and tap products), the sale (what is in it),
// pay (cash in, change out) and done (give the change, the receipt).
//
// Everything that matters about a sale lives in the till engine
// (lib/pos/useTill.ts): this file only decides what the cashier sees. The
// sale is on the device before "Sale complete" is shown, whatever the
// network is doing.
//
// Left out from the design until they are real: other ways to pay (D4d),
// a customer and a discount on the sale (D4d), the custom amount keypad
// (a sale line needs a product), sending the receipt by WhatsApp or SMS.

import { useMemo, useState } from "react";
import { formatGHS } from "@/lib/money";
import { statusText } from "@/lib/pos/outbox";
import { categoryTint, monogram, stockTone, tileSurface } from "@/lib/pos/tint";
import HeldSheet from "@/components/pos/HeldSheet";
import ScanSheet from "@/components/pos/ScanSheet";
import TillNotReady from "@/components/pos/TillNotReady";
import TileImage from "@/components/pos/TileImage";
import { Icon } from "@/components/shell/icons";
import type { Till } from "@/lib/pos/useTill";
import { KEYPAD, cents, clock, initials, likelyNotes, pressKey } from "@/lib/pos/cash";
import TillNotices from "@/components/pos/TillNotices";

type Screen = "sell" | "cart" | "pay" | "done";

export default function TerminalLayout({ till, onCloseShift }: { till: Till; onCloseShift: () => void }) {
  const { ready, device, cashier, shift, held, status, lastReceipt, printNote, catalogue, cart, total, saving } = till;
  const [screen, setScreen] = useState<Screen>("sell");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tendered, setTendered] = useState("");
  const [menu, setMenu] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [scanning, setScanning] = useState(false);

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

  function key(k: string) {
    setTendered((t) => pressKey(t, k));
  }

  async function finish() {
    if (await till.completeSale({ method: "cash", tendered: paid })) {
      setTendered("");
      setScreen("done");
    }
  }

  const title =
    screen === "cart" ? "This sale" : screen === "pay" ? "Take payment" : (device?.label ?? "Till");
  const subtitle =
    screen === "sell"
      ? shift
        ? `Shift open since ${clock(shift.openedAt)}`
        : "Ascend POS"
      : screen === "cart"
        ? `${items} item${items === 1 ? "" : "s"}`
        : screen === "done"
          ? "Ready for the next customer"
          : (device?.label ?? "Till");
  const back = screen === "cart" ? "sell" : screen === "pay" ? "cart" : null;

  return (
    <main className="flex h-[100dvh] flex-col bg-canvas text-ink">
      {/* The app bar: where you are, and who is selling. */}
      <header className="flex h-[54px] flex-none items-center gap-2.5 border-b border-neutral-100 bg-white pl-3.5 pr-3">
        {back && (
          <button
            onClick={() => setScreen(back)}
            aria-label="Go back"
            className="tap -ml-1.5 flex h-11 w-11 items-center justify-center rounded-[10px] text-ink"
          >
            <span className="rotate-180">
              <Icon name="chev" size={20} />
            </span>
          </button>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-heading text-[17px] font-extrabold leading-tight text-ink-heading">{title}</span>
          <span className="truncate text-[11.5px] text-neutral-500">{subtitle}</span>
        </span>
        {held.length > 0 && screen === "sell" && (
          <button
            onClick={() => setShowHeld(true)}
            className="tap flex items-center rounded-full bg-gold-100 px-3 text-[12px] font-bold text-gold-700"
          >
            {held.length} parked
          </button>
        )}
        {cashier && (
          <button
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            className="tap flex items-center gap-1.5 rounded-full bg-teal-50 py-1 pl-1 pr-2.5"
          >
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-teal text-[10.5px] font-bold text-white">
              {initials(cashier.displayName)}
            </span>
            <span className="text-[12.5px] font-semibold text-teal-800">{cashier.displayName.split(" ")[0]}</span>
          </button>
        )}
      </header>

      {menu && (
        <div className="relative z-20">
          <div className="absolute right-3 top-1 w-60 overflow-hidden rounded-card border border-line-brand bg-white shadow-lg">
            <button
              onClick={async () => {
                setMenu(false);
                await till.handOver();
                setScreen("sell");
              }}
              className="tap flex w-full items-center px-4 text-left text-[14px] font-semibold text-ink hover:bg-neutral-50"
            >
              Hand the till to someone else
            </button>
            <button
              onClick={() => {
                setMenu(false);
                onCloseShift();
              }}
              className="tap flex w-full items-center border-t border-neutral-100 px-4 text-left text-[14px] font-semibold text-ink hover:bg-neutral-50"
            >
              Count the drawer and close my shift
            </button>
          </div>
        </div>
      )}

      {/* Whether the sales have reached the office, in plain words. Quiet
          when they have; gold when something is waiting. */}
      {behind && (
        <button
          onClick={till.syncNow}
          className="tap flex flex-none items-center gap-2 bg-gold-100 px-3.5 text-left text-[12.5px] font-semibold text-gold-700"
        >
          <Icon name="alert" size={15} />
          {statusText(status)}
        </button>
      )}

      <TillNotices till={till} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {screen === "sell" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {ready && catalogue.length > 0 && (
              <div className="flex flex-none flex-col gap-2 px-3 pb-2 pt-3">
                <div className="flex gap-2">
                  <label className="flex h-11 flex-1 items-center gap-2 rounded-control border-[1.5px] border-line-brand bg-white px-3 text-neutral-500 focus-within:border-teal">
                    <Icon name="search" size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search products"
                      aria-label="Search products"
                      className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-neutral-500 focus:outline-none"
                    />
                  </label>
                  <button
                    onClick={() => setScanning(true)}
                    className="tap flex h-11 flex-none items-center gap-1.5 rounded-control bg-navy px-3.5 text-[13.5px] font-bold text-white"
                  >
                    Scan
                  </button>
                </div>
                {categories.length > 1 && (
                  <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        aria-pressed={category === cat}
                        className={`tap flex flex-none items-center rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${
                          category === cat ? "border-teal bg-teal text-white" : "border-line-brand bg-white text-neutral-700"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <section className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-3">
              {!ready && <p className="col-span-full py-8 text-center text-neutral-500">Opening your till...</p>}
              {ready && catalogue.length === 0 && (
                <div className="col-span-full">
                  <TillNotReady light reason="no_products" businessLabel={device?.label} onRetry={till.retryCatalogue} />
                </div>
              )}
              {ready && catalogue.length > 0 && visibleItems.length === 0 && (
                <p className="col-span-full py-8 text-center text-neutral-500">Nothing matches that. Clear the search to see everything.</p>
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
                      className={`tap relative flex flex-col gap-1.5 rounded-[14px] border-[1.5px] bg-white p-1.5 pb-2 text-left transition-transform active:scale-[0.98] disabled:opacity-50 ${
                        qty ? "border-teal" : "border-line-brand"
                      }`}
                    >
                      <span
                        className="relative flex h-[70px] w-full items-center justify-center overflow-hidden rounded-[10px]"
                        style={tileSurface(item.category)}
                      >
                        {item.photoUrl ? (
                          <TileImage url={item.photoUrl} className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="text-[20px] font-extrabold tracking-[-0.02em]" style={{ color: tintInk }}>
                            {monogram(item.name)}
                          </span>
                        )}
                        {qty && (
                          <span className="absolute right-1.5 top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-teal px-1.5 text-[11.5px] font-bold text-white">
                            {qty}
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 px-0.5 text-[13.5px] font-semibold leading-snug text-ink">{item.name}</span>
                      <span className="mt-auto flex items-baseline justify-between gap-1 px-0.5">
                        <span className="num font-heading text-[14.5px] font-bold text-ink-heading">{formatGHS(item.price)}</span>
                        {item.trackStock && item.localStock !== undefined && (
                          <span
                            className={`num text-[11.5px] font-semibold ${soldOut ? "text-danger-ink" : tone === "low" ? "text-gold-700" : "text-neutral-500"}`}
                          >
                            {soldOut ? "None left" : `${item.localStock} left`}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
            </section>

            {cart.length > 0 && (
              <button
                onClick={() => setScreen("cart")}
                className="tap mx-3 mb-2.5 flex h-[54px] flex-none items-center gap-2.5 rounded-[14px] bg-teal px-3.5 text-white shadow-[0_10px_22px_rgba(0,122,111,0.28)]"
              >
                <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-white/20 px-1.5 text-[13px] font-bold">{items}</span>
                <span className="flex-1 text-left text-[14.5px] font-semibold">View this sale</span>
                <span className="num font-heading text-[17px] font-extrabold">{formatGHS(total)}</span>
                <Icon name="chev" size={16} />
              </button>
            )}
          </div>
        )}

        {screen === "cart" && (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {cart.length === 0 && <p className="px-4 py-8 text-center text-neutral-500">Nothing in this sale yet.</p>}
              {cart.map((line) => {
                const [, tintInk] = categoryTint(line.item.category);
                return (
                  <div key={line.item.id} className="flex items-center gap-2.5 border-b border-neutral-100 px-3 py-2.5">
                    <span
                      aria-hidden
                      className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[9px] text-[11px] font-extrabold"
                      style={{ ...tileSurface(line.item.category), color: tintInk }}
                    >
                      {monogram(line.item.name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-semibold text-ink">{line.item.name}</span>
                      <span className="num text-[12px] text-neutral-500">
                        {formatGHS(line.item.price)} each · {formatGHS(cents(line.item.price * line.quantity))}
                      </span>
                    </span>
                    <span className="flex h-11 flex-none items-center rounded-control border-[1.5px] border-neutral-200">
                      <button
                        onClick={() => till.setQuantity(line.item.id, line.quantity - 1)}
                        aria-label={`One less ${line.item.name}`}
                        className="flex h-full w-10 items-center justify-center text-[20px] font-bold text-ink"
                      >
                        −
                      </button>
                      <span className="num min-w-[22px] text-center text-[15px] font-bold">{line.quantity}</span>
                      <button
                        onClick={() => till.setQuantity(line.item.id, line.quantity + 1)}
                        aria-label={`One more ${line.item.name}`}
                        className="flex h-full w-10 items-center justify-center text-teal-700"
                      >
                        <Icon name="plus" size={18} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-none flex-col gap-2 border-t border-neutral-100 px-3 pb-3 pt-2.5">
              <div className="flex items-baseline justify-between">
                <span className="font-heading text-[15px] font-bold text-ink-heading">Total</span>
                <span className="num font-heading text-[26px] font-extrabold tracking-[-0.02em] text-ink-heading">{formatGHS(total)}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    if (await till.parkSale()) setScreen("sell");
                  }}
                  disabled={cart.length === 0}
                  className="tap flex h-[54px] w-[72px] flex-none items-center justify-center rounded-[14px] border-[1.5px] border-neutral-200 text-[13px] font-bold text-ink disabled:opacity-40"
                >
                  Park it
                </button>
                <button
                  onClick={() => {
                    setTendered("");
                    setScreen("pay");
                  }}
                  disabled={cart.length === 0}
                  className="tap num flex h-[54px] flex-1 items-center justify-center rounded-[14px] bg-teal font-heading text-[17px] font-extrabold text-white disabled:opacity-40"
                >
                  Charge {formatGHS(total)}
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "pay" && (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="flex flex-none items-baseline justify-between px-3.5 pb-2.5 pt-3">
              <span className="text-[12.5px] text-neutral-500">To pay, in cash</span>
              <span className="num font-heading text-[28px] font-extrabold tracking-[-0.02em] text-ink-heading">{formatGHS(total)}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-3">
              <div className="flex items-center justify-between rounded-control bg-neutral-50 px-3 py-2">
                <span className="text-[12.5px] text-neutral-600">Received</span>
                <span className={`num font-heading text-[24px] font-extrabold ${tendered ? "text-ink-heading" : "text-neutral-500"}`}>
                  {formatGHS(paid)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {likelyNotes(total).map((n, i) => (
                  <button
                    key={n}
                    onClick={() => setTendered(String(n))}
                    className={`tap num rounded-[10px] border-[1.5px] text-[13px] font-bold ${
                      paid === n ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-ink"
                    }`}
                  >
                    {i === 0 ? "Exact" : formatGHS(n).replace(".00", "")}
                  </button>
                ))}
              </div>
              <div className="grid min-h-[180px] flex-1 auto-rows-fr grid-cols-3 gap-1.5">
                {KEYPAD.map((k) => (
                  <button
                    key={k}
                    onClick={() => key(k)}
                    aria-label={k === "back" ? "Delete the last digit" : k === "." ? "Decimal point" : k}
                    className="tap flex items-center justify-center rounded-[10px] bg-neutral-50 font-heading text-[19px] font-bold text-ink active:bg-teal-50"
                  >
                    {k === "back" ? "←" : k}
                  </button>
                ))}
              </div>
              <div
                className={`flex items-center justify-between rounded-control px-3 py-2 ${
                  !tendered ? "bg-neutral-50 text-neutral-600" : enough ? "bg-success-tint text-success-ink" : "bg-gold-100 text-gold-700"
                }`}
              >
                <span className="text-[13.5px] font-bold">{enough || !tendered ? "Change" : "Still to pay"}</span>
                <span className="num font-heading text-[20px] font-extrabold">
                  {formatGHS(enough ? cents(paid - total) : tendered ? cents(total - paid) : 0)}
                </span>
              </div>
            </div>
            <button
              onClick={finish}
              disabled={!enough || saving}
              className="tap num mx-3 mb-3 mt-2.5 flex h-14 flex-none items-center justify-center rounded-[14px] bg-teal font-heading text-[16.5px] font-extrabold text-white disabled:opacity-40"
            >
              {saving ? "Saving the sale on this till..." : enough ? `Take ${formatGHS(paid)} cash` : "Enter what they gave you"}
            </button>
          </div>
        )}

        {screen === "done" && lastReceipt && (
          <div className="flex flex-1 flex-col gap-3.5 bg-white px-4 pb-3.5 pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-success-tint text-success-ink">
                <Icon name="check" size={28} />
              </span>
              <span className="flex flex-col">
                <span className="font-heading text-[21px] font-extrabold text-ink-heading">Sale complete</span>
                <span className="mono text-[12.5px] text-neutral-500">
                  {lastReceipt.number} · {formatGHS(lastReceipt.total)} cash
                </span>
              </span>
            </div>
            {/* @contrast-surface navy */}
            {(lastReceipt.doc.change ?? 0) > 0 && (
              <div className="flex items-center justify-between rounded-card bg-navy px-4 py-3.5 text-white">
                <span className="font-heading text-[15px] font-bold">Give change</span>
                <span className="num font-heading text-[30px] font-extrabold text-teal-mint-bright">{formatGHS(lastReceipt.doc.change ?? 0)}</span>
              </div>
            )}
            {/* @contrast-surface white */}
            <div
              className={`flex items-center gap-2.5 rounded-[14px] p-3 ${printNote ? "bg-gold-100 text-gold-700" : "bg-neutral-50 text-ink"}`}
            >
              <span className="flex flex-1 flex-col">
                <span className="text-[14px] font-bold">{printNote ? "The receipt did not print" : "Receipt sent to the printer"}</span>
                <span className="text-[12px]">{printNote ?? "The sale is saved either way."}</span>
              </span>
              <button
                onClick={() => till.printReceipt(lastReceipt.doc)}
                className="tap flex items-center rounded-control px-2 text-[13px] font-bold text-teal-700"
              >
                Print again
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-[12.5px] text-neutral-600">
              <span className={behind ? "text-gold-700" : "text-success-ink"}>
                <Icon name={behind ? "clock" : "check"} size={15} />
              </span>
              {behind ? "Saved on this till. It sends itself when the network is back." : "Saved, and sent to the office."}
            </p>
            <div className="flex-1" />
            <button
              onClick={() => setScreen("sell")}
              className="tap flex h-14 items-center justify-center rounded-[14px] bg-teal font-heading text-[17px] font-extrabold text-white"
            >
              Start the next sale
            </button>
          </div>
        )}
      </div>

      {scanning && (
        <ScanSheet catalogue={catalogue} onAdd={till.addToCart} onAttach={till.attachBarcode} onClose={() => setScanning(false)} />
      )}

      {showHeld && (
        <HeldSheet
          held={held}
          onResume={async (id) => {
            if (await till.bringBack(id)) {
              setShowHeld(false);
              setScreen("cart");
            }
          }}
          onDiscard={till.throwAway}
          onClose={() => setShowHeld(false)}
        />
      )}
    </main>
  );
}
