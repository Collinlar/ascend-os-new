"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatGHS } from "@/lib/money";
import BarcodeCapture from "./BarcodeCapture";
import { prepareImage } from "@/lib/images";
import type { StockRow } from "@/app/api/catalogue/items/route";
import { EmptyState, Panel as Surface } from "@/components/shell/Page";
import Pills from "@/components/shell/Pills";
import { initials } from "@/components/shop/storefront-parts";

// The merchant's own view of what they sell. Price, barcode and what is on
// the shelf, in one list, because those are the three things that go wrong
// and they go wrong together.

type Panel = "edit" | "stock" | null;

export default function ProductManager({
  businessId,
  locationId,
  items,
  sellsOnline,
}: {
  businessId: string;
  locationId: string;
  items: StockRow[];
  /** Shop fields appear only for a business that has Shop. */
  sellsOnline: boolean;
}) {
  const [rows, setRows] = useState(items);
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [shopVisible, setShopVisible] = useState(true);
  const [shopPrice, setShopPrice] = useState("");
  const [newPhoto, setNewPhoto] = useState<{ base64: string; mediaType: string; preview: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [movementKind, setMovementKind] = useState<"restock" | "damage_loss" | "count_correction">(
    "restock"
  );
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  // Which product is having its barcode scanned, if any.
  const [scanningFor, setScanningFor] = useState<string | null>(null);
  const [filter, setFilter] = useState("Everything");

  // The four ways a catalogue is actually wrong, each one a filter. A
  // merchant who opens this screen is usually looking for the broken ones,
  // not reading all of them.
  const faults = useMemo(() => {
    const isLow = (r: StockRow) =>
      r.trackStock &&
      r.lowStockThreshold !== null &&
      r.quantityOnHand <= r.lowStockThreshold;
    return {
      "No price": rows.filter((r) => r.price === null),
      "Low stock": rows.filter(isLow),
      "No barcode": rows.filter((r) => !r.barcode),
      "Not counted": rows.filter((r) => !r.trackStock),
    } as Record<string, StockRow[]>;
  }, [rows]);

  const shown = filter === "Everything" ? rows : faults[filter] ?? rows;

  function openEdit(row: StockRow) {
    setOpen(row.itemId);
    setPanel("edit");
    setName(row.name);
    setDescription(row.description ?? "");
    setCategory(row.category ?? "");
    setPrice(row.price === null ? "" : String(row.price));
    setBarcode(row.barcode ?? "");
    setLowStock(row.lowStockThreshold === null ? "" : String(row.lowStockThreshold));
    setShopVisible(row.shopVisible ?? true);
    setShopPrice(row.shopPriceOverride === null ? "" : String(row.shopPriceOverride));
    setNewPhoto(null);
    setError(null);
    setNote(null);
  }

  function openStock(row: StockRow) {
    setOpen(row.itemId);
    setPanel("stock");
    setMovementKind(row.trackStock ? "restock" : "restock");
    setQuantity("");
    setReason("");
    setError(null);
    setNote(null);
  }

  async function saveEdit(row: StockRow) {
    if (name.trim().length < 2) {
      setError("Give the product a name your customers will recognise.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // A replaced photo goes up first, so the product edit carries a URL
      // that already exists. A failed upload keeps the old picture rather
      // than losing the rest of the edit.
      let photoUrl: string | undefined;
      if (newPhoto) {
        const up = await fetch("/api/catalogue/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            imageBase64: newPhoto.base64,
            mediaType: newPhoto.mediaType,
          }),
        });
        const upData = await up.json().catch(() => null);
        if (up.ok && upData?.url) photoUrl = upData.url;
        else setNote("The new picture did not upload. Everything else saved.");
      }

      const res = await fetch("/api/catalogue/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          itemId: row.itemId,
          name: name.trim(),
          category: category.trim() === "" ? null : category.trim(),
          price: price === "" ? undefined : Number(price),
          barcode: barcode.trim() === "" ? null : barcode.trim(),
          lowStockThreshold: lowStock.trim() === "" ? null : Number(lowStock),
          ...(photoUrl ? { photoUrl } : {}),
          // Shop fields are simply not sent by a business without Shop, so
          // the server never has to guess what a missing field means.
          ...(sellsOnline
            ? {
                description: description.trim() === "" ? null : description.trim(),
                shopVisible,
                shopPriceOverride: shopPrice.trim() === "" ? null : Number(shopPrice),
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not save that. Tap again.");
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.itemId === row.itemId
            ? {
                ...r,
                name: name.trim(),
                description: sellsOnline
                  ? description.trim() === ""
                    ? null
                    : description.trim()
                  : r.description,
                category: category.trim() === "" ? null : category.trim(),
                price: price === "" ? r.price : Number(price),
                barcode: barcode.trim() === "" ? null : barcode.trim(),
                lowStockThreshold: lowStock.trim() === "" ? null : Number(lowStock),
                photoUrl: photoUrl ?? r.photoUrl,
                shopVisible: sellsOnline ? shopVisible : r.shopVisible,
                shopPriceOverride: sellsOnline
                  ? shopPrice.trim() === ""
                    ? null
                    : Number(shopPrice)
                  : r.shopPriceOverride,
              }
            : r
        )
      );
      setPanel(null);
      setOpen(null);
    } catch {
      setError("We could not reach the network. Tap save again in a moment.");
    } finally {
      setBusy(false);
      setNewPhoto(null);
    }
  }

  async function toggleActive(row: StockRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/catalogue/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, itemId: row.itemId, active: !row.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "We could not change that. Tap again.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.itemId === row.itemId ? { ...r, active: !r.active } : r))
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveStock(row: StockRow) {
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || (movementKind !== "count_correction" && amount <= 0)) {
      setError("Enter how many.");
      return;
    }
    if (movementKind !== "restock" && reason.trim() === "") {
      setError("Say what happened. This is the note that explains a missing item later.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/catalogue/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId,
          itemId: row.itemId,
          kind: movementKind,
          quantity: movementKind === "count_correction" ? undefined : amount,
          countedQuantity: movementKind === "count_correction" ? amount : undefined,
          reason: reason.trim() || undefined,
          clientRef: `stock:${row.itemId}:${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save that. Tap again.");
        return;
      }

      const moved = Number(data.quantity ?? 0);
      setRows((prev) =>
        prev.map((r) =>
          r.itemId === row.itemId
            ? {
                ...r,
                quantityOnHand: r.quantityOnHand + moved,
                trackStock: r.trackStock || movementKind === "restock",
              }
            : r
        )
      );
      setNote(
        data.no_change
          ? "Your count matches the record. Nothing to change."
          : "Saved. The till picks this up on its next sync."
      );
      setPanel(null);
      setOpen(null);
    } catch {
      setError("We could not reach the network. Tap save again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No products yet."
        detail="Add what you sell, then set your prices and counts here."
        action={
          <Link
            href="/products/add"
            className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover"
          >
            Add my first products
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* One hidden picker for the whole list; the button records which
          product it was opened for. */}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !photoFor) return;
          // Downscaled here, so a merchant replacing a photo pays the same
          // small cost as adding one.
          const prepared = await prepareImage(file).catch(() => null);
          if (!prepared) {
            setError("That photo could not be opened. Try another.");
            return;
          }
          setNewPhoto({
            base64: prepared.base64,
            mediaType: prepared.mediaType,
            preview: prepared.previewUrl,
          });
        }}
      />

      {scanningFor && (
        <BarcodeCapture
          title="Scan this product"
          onClose={() => setScanningFor(null)}
          onCapture={(code) => {
            setBarcode(code.trim());
            setScanningFor(null);
          }}
        />
      )}

      <Pills
        pills={[
          { label: "Everything" },
          { label: "No price", count: faults["No price"].length },
          { label: "Low stock", count: faults["Low stock"].length },
          { label: "No barcode", count: faults["No barcode"].length },
          { label: "Not counted", count: faults["Not counted"].length },
        ]}
        active={filter}
        onPick={setFilter}
        trailing={`${shown.length} ${shown.length === 1 ? "product" : "products"}`}
      />

      {error && (
        <p className="mb-2.5 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}
      {note && (
        <p className="mb-2.5 rounded-panel bg-teal-light px-4 py-3 text-sm font-semibold text-teal-dark">
          {note}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          title={`Nothing is ${filter.toLowerCase()}.`}
          detail="That part of your catalogue is in order."
        />
      ) : (
      <Surface>
      {shown.map((row, i) => {
        const noPrice = row.price === null;
        const low =
          row.trackStock &&
          row.lowStockThreshold !== null &&
          row.quantityOnHand <= row.lowStockThreshold;

        return (
          <div
            key={row.itemId}
            className={`${i < shown.length - 1 ? "border-b border-[#EEF3F7]" : ""} ${
              row.active ? "" : "opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[22px] py-4">
              {row.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-[46px] w-[46px] flex-none rounded-control object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-control bg-light-grey text-sm font-extrabold tracking-[-0.02em] text-ink-slate"
                >
                  {initials(row.name)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold leading-snug tracking-[-0.01em] text-ink sm:truncate">
                  {row.name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  {noPrice ? (
                    // The till hides unpriced items, so say so here rather
                    // than let a merchant wonder where it went.
                    <span className="rounded-full bg-gold-tint px-2 py-0.5 text-[11.5px] font-bold text-gold-ink">
                      No price, so the till hides it
                    </span>
                  ) : (
                    <span className="num text-[13.5px] font-bold text-teal-dark">
                      {formatGHS(row.price as number)}
                    </span>
                  )}
                  {row.trackStock ? (
                    <span
                      className={`text-[12.5px] font-semibold ${
                        low ? "text-gold-ink" : "text-slate-grey"
                      }`}
                    >
                      {row.quantityOnHand} on the shelf
                    </span>
                  ) : (
                    <span className="text-[12.5px] font-semibold text-slate-grey">
                      Not counted
                    </span>
                  )}
                  {row.barcode ? (
                    <span className="mono text-[11.5px] font-medium text-slate-grey">
                      {row.barcode}
                    </span>
                  ) : (
                    <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[11.5px] font-bold text-danger-ink">
                      No barcode
                    </span>
                  )}
                  {!row.active && (
                    <span className="text-[12.5px] font-semibold text-slate-grey">
                      Not selling
                    </span>
                  )}
                </div>
              </div>

              <div className="flex w-full flex-none justify-end gap-2 sm:w-auto">
                <button
                  onClick={() => openStock(row)}
                  className="tap flex items-center rounded-chip bg-teal-light px-4 text-[13px] font-bold text-teal-dark hover:bg-teal-pale"
                >
                  Stock
                </button>
                <button
                  onClick={() => openEdit(row)}
                  className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
                >
                  Edit
                </button>
              </div>
            </div>

            {open === row.itemId && panel === "edit" && (
              <div className="space-y-3 border-t border-[#EEF3F7] bg-[#F6F9FB] px-[22px] py-4">
                {/* Photo, replaceable. A blurred shot used to be permanent. */}
                <div className="flex items-center gap-3">
                  {newPhoto?.preview ?? row.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={newPhoto?.preview ?? (row.photoUrl as string)}
                      alt=""
                      className="h-16 w-16 rounded-panel object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-panel bg-light-grey text-xs text-ink-muted">
                      No photo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFor(row.itemId);
                      photoInput.current?.click();
                    }}
                    className="tap rounded-control border border-line px-4 py-2 text-sm font-medium text-ink"
                  >
                    {row.photoUrl ? "Change photo" : "Add a photo"}
                  </button>
                </div>

                <div>
                  <label className="text-xs text-ink-muted">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What your customers call it"
                    className="mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-ink-muted">Price in GHS</label>
                    <input
                      value={price}
                      onChange={(e) => setPrice(onlyNumeric(e.target.value))}
                      inputMode="decimal"
                      placeholder="What do you charge?"
                      className="num mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-ink-muted">Group</label>
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Drinks, Soap"
                      className="mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-ink-muted">
                    Barcode, the number under the bars
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value.trim())}
                      inputMode="numeric"
                      placeholder="Scan or type it so the till can find this"
                      className="num flex-1 rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setScanningFor(row.itemId)}
                      className="tap shrink-0 rounded-control border border-teal px-4 text-sm font-semibold text-teal-dark"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-ink-muted">
                    Warn me when the shelf drops to
                  </label>
                  <input
                    value={lowStock}
                    onChange={(e) => setLowStock(onlyNumeric(e.target.value))}
                    inputMode="decimal"
                    placeholder="Leave empty for no warning"
                    className="num mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                  />
                </div>

                {/* Only a business with Shop sees any of this. */}
                {sellsOnline && (
                  <div className="space-y-3 rounded-panel bg-light-grey p-3">
                    <p className="mono text-[11px] uppercase tracking-eyebrow text-teal-dark">
                      On your Shop
                    </p>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={shopVisible}
                        onChange={(e) => setShopVisible(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-teal"
                      />
                      <span className="text-sm text-ink">
                        Show this on my Shop
                        <span className="block text-xs text-ink-muted">
                          Turn it off to keep selling at the counter without
                          listing it online.
                        </span>
                      </span>
                    </label>

                    <div>
                      <label className="text-xs text-ink-muted">
                        Shop price, if it differs from the counter
                      </label>
                      <input
                        value={shopPrice}
                        onChange={(e) => setShopPrice(onlyNumeric(e.target.value))}
                        inputMode="decimal"
                        placeholder="Leave empty to use the same price"
                        className="num mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-ink-muted">
                        What customers read online
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="A line or two about it"
                        className="mt-1 w-full resize-y rounded-control border border-line px-3 py-2 text-sm focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => saveEdit(row)}
                    disabled={busy}
                    className="tap rounded-control bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "Save this product"}
                  </button>
                  <button
                    onClick={() => toggleActive(row)}
                    disabled={busy}
                    className="tap rounded-control border border-line px-3 py-2 text-sm font-medium text-ink"
                  >
                    {row.active ? "Stop selling this" : "Sell this again"}
                  </button>
                  <button
                    onClick={() => setPanel(null)}
                    className="tap px-3 py-2 text-sm font-medium text-ink-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open === row.itemId && panel === "stock" && (
              <div className="space-y-3 border-t border-[#EEF3F7] bg-[#F6F9FB] px-[22px] py-4">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["restock", "Goods came in"],
                      ["damage_loss", "Damaged or lost"],
                      ["count_correction", "I counted the shelf"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      onClick={() => {
                        setMovementKind(kind);
                        setError(null);
                      }}
                      className={`tap rounded-chip px-3 py-1.5 text-sm font-medium ${
                        movementKind === kind
                          ? "bg-teal text-white"
                          : "border border-line text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-xs text-ink-muted">
                    {movementKind === "count_correction"
                      ? "How many are actually there?"
                      : "How many?"}
                  </label>
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    autoFocus
                    placeholder={movementKind === "count_correction" ? "Your count" : "Quantity"}
                    className="num mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                  />
                  {movementKind === "count_correction" && (
                    <p className="mt-1 text-xs text-ink-muted">
                      The record says {row.quantityOnHand}. We keep both, so the
                      difference stays visible.
                    </p>
                  )}
                </div>

                {movementKind !== "restock" && (
                  <div>
                    <label className="text-xs text-ink-muted">What happened?</label>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Broken in transit, expired, miscounted"
                      className="mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => saveStock(row)}
                    disabled={busy}
                    className="tap rounded-control bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "Save this change"}
                  </button>
                  <button
                    onClick={() => setPanel(null)}
                    className="tap px-3 py-2 text-sm font-medium text-ink-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </Surface>
      )}
    </div>
  );
}

// Prices and counts are typed on a phone keypad that offers letters too.
function onlyNumeric(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}
