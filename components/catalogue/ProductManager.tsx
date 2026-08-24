"use client";

import { useRef, useState } from "react";
import { formatGHS } from "@/lib/money";
import BarcodeCapture from "./BarcodeCapture";
import { prepareImage } from "@/lib/images";
import type { StockRow } from "@/app/api/catalogue/items/route";

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
      <div className="rounded-panel bg-white px-4 py-10 text-center">
        <p className="font-medium text-ink">No products yet.</p>
        <p className="mt-1 text-sm text-mid-grey">
          Add what you sell, then set your prices and counts here.
        </p>
        <a
          href="/products/add"
          className="tap mt-4 inline-block rounded-control bg-teal px-5 py-2.5 text-sm font-semibold text-white"
        >
          Add my first products
        </a>
      </div>
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

      <a
        href="/products/add"
        className="tap mb-2 block rounded-control border border-teal px-4 py-3 text-center text-sm font-semibold text-teal-dark"
      >
        Add more products
      </a>

      {error && (
        <p className="rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-dark">{error}</p>
      )}
      {note && (
        <p className="rounded-panel bg-teal-light px-4 py-3 text-sm text-teal-dark">{note}</p>
      )}

      {rows.map((row) => {
        const noPrice = row.price === null;
        const low =
          row.trackStock &&
          row.lowStockThreshold !== null &&
          row.quantityOnHand <= row.lowStockThreshold;

        return (
          <div
            key={row.itemId}
            className={`rounded-panel bg-white px-4 py-3 ${row.active ? "" : "opacity-60"}`}
          >
            <div className="flex items-start justify-between gap-3">
              {row.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-panel object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{row.name}</p>
                <p className="num mt-0.5 text-sm text-mid-grey">
                  {noPrice ? (
                    // The till hides unpriced items, so say so here rather
                    // than let a merchant wonder where it went.
                    <span className="text-gold-dark">No price yet, so the till hides it</span>
                  ) : (
                    formatGHS(row.price as number)
                  )}
                  {row.trackStock && (
                    <>
                      {" · "}
                      <span className={low ? "text-gold-dark" : ""}>
                        {row.quantityOnHand} on the shelf
                      </span>
                    </>
                  )}
                  {!row.active && " · not selling"}
                </p>
                {row.barcode ? (
                  <p className="mono mt-0.5 text-[11px] text-soft-grey">{row.barcode}</p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-soft-grey">
                    No barcode, so it cannot be scanned
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => openStock(row)}
                  className="tap rounded-control bg-teal px-3 py-2 text-sm font-semibold text-white"
                >
                  Stock
                </button>
                <button
                  onClick={() => openEdit(row)}
                  className="tap rounded-control border border-line px-3 py-2 text-sm font-medium text-ink"
                >
                  Edit
                </button>
              </div>
            </div>

            {open === row.itemId && panel === "edit" && (
              <div className="mt-3 space-y-3 border-t border-line pt-3">
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
                    <span className="flex h-16 w-16 items-center justify-center rounded-panel bg-light-grey text-xs text-mid-grey">
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
                  <label className="text-xs text-mid-grey">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What your customers call it"
                    className="mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-mid-grey">Price in GHS</label>
                    <input
                      value={price}
                      onChange={(e) => setPrice(onlyNumeric(e.target.value))}
                      inputMode="decimal"
                      placeholder="What do you charge?"
                      className="num mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-mid-grey">Group</label>
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Drinks, Soap"
                      className="mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-mid-grey">
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
                  <label className="text-xs text-mid-grey">
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
                        <span className="block text-xs text-mid-grey">
                          Turn it off to keep selling at the counter without
                          listing it online.
                        </span>
                      </span>
                    </label>

                    <div>
                      <label className="text-xs text-mid-grey">
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
                      <label className="text-xs text-mid-grey">
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
                    className="tap px-3 py-2 text-sm font-medium text-mid-grey"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open === row.itemId && panel === "stock" && (
              <div className="mt-3 space-y-3 border-t border-line pt-3">
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
                  <label className="text-xs text-mid-grey">
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
                    <p className="mt-1 text-xs text-mid-grey">
                      The record says {row.quantityOnHand}. We keep both, so the
                      difference stays visible.
                    </p>
                  )}
                </div>

                {movementKind !== "restock" && (
                  <div>
                    <label className="text-xs text-mid-grey">What happened?</label>
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
                    className="tap px-3 py-2 text-sm font-medium text-mid-grey"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Prices and counts are typed on a phone keypad that offers letters too.
function onlyNumeric(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}
