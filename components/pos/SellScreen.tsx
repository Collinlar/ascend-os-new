"use client";

// @contrast-surface navy
// The till's selling screen, as it was before the v3 layouts. It reads
// everything from the till engine (lib/pos/useTill.ts) and keeps only what
// is about the screen itself: the search, the category, the checkout.
import { useMemo, useState } from "react";
import { changeDue, formatGHS } from "@/lib/money";
import { statusText } from "@/lib/pos/outbox";
import { categoryTint, monogram, stockTone, tileSurface } from "@/lib/pos/tint";
import HeldSheet from "@/components/pos/HeldSheet";
import ScanSheet from "@/components/pos/ScanSheet";
import TillNotReady from "@/components/pos/TillNotReady";
import TileImage from "@/components/pos/TileImage";
import type { Till } from "@/lib/pos/useTill";

export default function SellScreen({ till, onCloseShift }: { till: Till; onCloseShift: () => void }) {
  const { ready, device, cashier, held, status, stuck, storage, error, lastReceipt, printNote, catalogue, cart, total, saving } = till;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [checkout, setCheckout] = useState(false);
  const [tendered, setTendered] = useState("");
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

  return (
    <main className="flex min-h-screen flex-col bg-navy text-white">
      {/* Status strip: connectivity and queue depth, in plain words */}
      <header className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onCloseShift}
            className="tap flex items-center px-1 font-medium"
          >
            {device?.label ?? "Till"}
          </button>
          {cashier && (
            <button
              onClick={async () => {
                await till.handOver();
                setCheckout(false);
              }}
              className="tap flex items-center rounded-chip bg-white/10 px-3 text-xs font-bold text-on-dark"
            >
              {cashier.displayName.split(" ")[0]} · hand over
            </button>
          )}
          {held.length > 0 && (
            <button
              onClick={() => setShowHeld(true)}
              className="tap flex items-center rounded-chip bg-white/10 px-3 text-xs font-bold text-teal-mint"
            >
              {held.length} parked
            </button>
          )}
        </div>
        <button
          onClick={till.syncNow}
          className={`tap px-2 ${
            status.kind === "needs_attention" || status.pending > 0
              ? "text-gold"
              : "text-teal-light"
          }`}
        >
          {statusText(status)}
        </button>
      </header>

      {/* Sales the server refused. They are safe on this till, but nothing
          used to say they existed, so a merchant saw a number that never
          fell and had nothing to do about it. */}
      {stuck.length > 0 && (
        <div className="mx-4 mb-2 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-ink">
          <p className="font-bold">
            {stuck.length} thing{stuck.length === 1 ? "" : "s"} the office is not
            taking.
          </p>
          <p className="mt-1">
            {stuck[0].lastError?.includes("receipt_number") ||
            stuck[0].lastError?.includes("duplicate key")
              ? "Their receipt numbers were already used. The office can give them new ones once this till is updated."
              : (stuck[0].lastError ?? "The office did not say why.")}
          </p>
          {/* The exact words the server used, because a merchant on the phone
              to support should be able to read them out. */}
          <p className="mono mt-1 text-[11px] opacity-70">
            {stuck[0].kind} · tried {stuck[0].tries} times · {stuck[0].lastError ?? "no reason given"}
          </p>
          <button
            onClick={till.resendStuck}
            className="tap mt-2 rounded-control bg-gold-dark px-4 py-2 text-sm font-semibold text-white"
          >
            Try sending them again
          </button>
        </div>
      )}

      {storage?.critical && (
        <p className="mx-4 mb-2 bg-gold px-3 py-2 text-sm font-semibold text-navy">
          This till is almost full. Send your sales and call support today.
        </p>
      )}

      {error && (
        <p className="mx-4 mb-2 bg-gold-light px-3 py-2 text-sm text-gold-ink">{error}</p>
      )}

      {lastReceipt && (
        <div className="mx-4 mb-2 rounded-panel bg-teal-dark px-4 py-3 text-sm">
          <p className="font-medium">
            Sale done. Receipt {lastReceipt.number} · {formatGHS(lastReceipt.total)}
          </p>
          <p className="text-teal-light">
            Saved on this till. It sends itself when the network returns.
          </p>
          {printNote && <p className="mt-1 text-gold">{printNote}</p>}
          <button
            onClick={() => till.printReceipt(lastReceipt.doc)}
            className="tap mt-2 rounded-chip bg-white/15 px-3 py-1 text-xs font-bold"
          >
            Print the receipt again
          </button>
        </div>
      )}

      {/* Find an item: search by name, or narrow to a category. Both matter
          when the grid is longer than one screen (POS-003). */}
      {ready && catalogue.length > 0 && (
        <div className="px-4 pb-1">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your items"
              className="flex-1 rounded-control bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-teal-mint"
              aria-label="Search items"
            />
            <button
              onClick={() => setScanning(true)}
              className="tap shrink-0 rounded-control bg-white/10 px-4 font-bold text-teal-mint"
            >
              Scan
            </button>
          </div>
          {categories.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`tap shrink-0 rounded-chip px-3 text-sm font-bold transition-colors ${
                    category === cat
                      ? "bg-teal text-white"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Item tiles: large tap targets, minimal depth (POS-002, POS-003).
          Category tint and monogram let a cashier find an item by shape and
          colour before reading the label. */}
      {/* A cashier finds an item by its picture, then confirms with the
          name, price and what is left. The picture has to be recognisable,
          not large: it was taking a whole screen for three products, which
          turns finding into scrolling. */}
      <section className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {!ready && <p className="col-span-full text-white/60">Opening your till...</p>}
        {/* An empty catalogue and an empty search result are different
            problems. Telling someone to clear a search they never typed is
            how a merchant concludes the till is broken. */}
        {ready && catalogue.length === 0 && (
          <div className="col-span-full">
            <TillNotReady
              reason="no_products"
              businessLabel={device?.label}
              onRetry={till.retryCatalogue}
            />
          </div>
        )}
        {ready && catalogue.length > 0 && visibleItems.length === 0 && (
          <p className="col-span-full py-8 text-center text-white/60">
            Nothing matches that. Clear the search to see everything.
          </p>
        )}
        {ready &&
          visibleItems.map((item) => {
            const [, tintInk] = categoryTint(item.category);
            const tone = stockTone(item.localStock, item.lowStockThreshold);
            const soldOut = tone === "out";
            return (
              <button
                key={item.id}
                onClick={() => !soldOut && till.addToCart(item)}
                disabled={soldOut}
                className="tap flex flex-col overflow-hidden rounded-panel text-left transition-transform active:scale-[0.98] disabled:opacity-45"
              >
                <span
                  className="flex h-20 shrink-0 items-center justify-center overflow-hidden sm:h-24"
                  style={tileSurface(item.category)}
                >
                  {item.photoUrl ? (
                    <TileImage
                      url={item.photoUrl}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span
                      className="text-[22px] font-extrabold tracking-[-0.02em]"
                      style={{ color: tintInk }}
                    >
                      {monogram(item.name)}
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 bg-white/10 px-3 py-2">
                  <span className="truncate text-[13px] font-semibold leading-snug">
                    {item.name}
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="num text-[15px] font-bold">
                      {formatGHS(item.price)}
                    </span>
                    {item.trackStock && item.localStock !== undefined && (
                      <span
                        className={`num text-[11px] font-semibold ${
                          soldOut
                            ? "text-gold"
                            : tone === "low"
                              ? "text-gold"
                              : "text-white/55"
                        }`}
                      >
                        {soldOut ? "None left" : `${item.localStock} left`}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
      </section>

      {/* Cart */}
      {cart.length > 0 && !checkout && (
        <section className="border-t border-white/15 bg-navy px-4 pb-4 pt-3">
          {cart.map((line) => (
            <div key={line.item.id} className="flex items-center justify-between py-1.5">
              <span className="flex-1 truncate pr-2 text-sm">{line.item.name}</span>
              <div className="flex items-center gap-3">
                <button
                  className="tap w-11 bg-white/10 text-lg"
                  onClick={() => till.setQuantity(line.item.id, line.quantity - 1)}
                  aria-label={`Reduce ${line.item.name}`}
                >
                  −
                </button>
                <span className="w-6 text-center">{line.quantity}</span>
                <button
                  className="tap w-11 bg-white/10 text-lg"
                  onClick={() => till.setQuantity(line.item.id, line.quantity + 1)}
                  aria-label={`Add ${line.item.name}`}
                >
                  +
                </button>
                <span className="num w-20 text-right text-sm">
                  {formatGHS(line.item.price * line.quantity)}
                </span>
              </div>
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                if (await till.parkSale()) setCheckout(false);
              }}
              className="tap rounded-control border border-white/25 px-4 text-sm font-bold text-white/80"
            >
              Park it
            </button>
            <button
              onClick={() => setCheckout(true)}
              className="num tap flex-1 rounded-control bg-teal py-4 text-lg font-semibold transition-colors active:bg-teal-dark"
            >
              Take payment · {formatGHS(total)}
            </button>
          </div>
        </section>
      )}

      {/* Cash checkout: change calculated for the cashier (POS-PAY-002) */}
      {checkout && (
        <section className="border-t border-white/15 bg-navy px-4 pb-6 pt-4">
          <p className="text-sm text-white/70">Cash received</p>
          <input
            inputMode="decimal"
            autoFocus
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            placeholder="How much did they give you?"
            className="num mt-2 w-full rounded-control bg-white/10 px-4 py-3 text-2xl font-semibold text-white placeholder:text-base placeholder:font-normal placeholder:text-white/60 focus:outline-none"
          />
          {parseFloat(tendered) >= total && (
            <p className="mt-2 text-lg">
              Change due:{" "}
              <span className="num font-semibold text-gold">
                {formatGHS(changeDue(parseFloat(tendered), total))}
              </span>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCheckout(false)}
              className="tap flex-1 border border-white/30 py-3.5 font-medium"
            >
              Back to cart
            </button>
            <button
              onClick={async () => {
                if (await till.completeSale({ method: "cash", tendered: parseFloat(tendered) })) {
                  setTendered("");
                  setCheckout(false);
                }
              }}
              disabled={!(parseFloat(tendered) >= total) || saving}
              className="tap flex-[2] bg-teal py-3.5 text-lg font-semibold disabled:opacity-40"
            >
              {saving ? "Saving..." : "Finish sale"}
            </button>
          </div>
        </section>
      )}

      {scanning && (
        <ScanSheet
          catalogue={catalogue}
          onAdd={till.addToCart}
          onAttach={till.attachBarcode}
          onClose={() => setScanning(false)}
        />
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
