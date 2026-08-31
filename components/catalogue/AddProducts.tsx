"use client";

import { useRef, useState } from "react";
import { formatGHS } from "@/lib/money";
import { prepareImage } from "@/lib/images";

// Catalogue-first product entry (SHP-001..SHP-005): the merchant starts
// from product photos, reviews suggestions and sets prices before anything
// else is asked of them.
//
// This is the only way into the catalogue, for every merchant, so the copy
// follows what they actually sell rather than assuming a Shop.
//
// Photos come in batches because that is how a shop is stocked: someone
// walks the shelves with a phone. Naming runs one at a time behind that,
// since the vision model is rate limited and firing twenty at once fails
// twenty. A photo whose naming fails is never discarded; it becomes a draft
// the merchant names themselves, because the photo is the part that took
// effort to capture.

interface Suggestion {
  name: string;
  description: string;
  category: string;
  visible_attributes: string[];
  suggested_price_note: string;
  confidence: "high" | "medium" | "low";
}

type DraftStatus = "naming" | "ready" | "needs_name";

interface DraftProduct {
  id: string;
  /** Downscaled already, so this is what gets shown and what gets sent. */
  photoDataUrl: string;
  photoBase64: string;
  mediaType: string;
  suggestion: Suggestion | null;
  name: string;
  description: string;
  price: string;
  saved: boolean;
  status: DraftStatus;
  note?: string;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function AddProducts({
  businessId,
  sellsOnline,
}: {
  businessId: string;
  /** Whether this business has Ascend Shop. A till-only merchant should not
      be told their photos become a Shop they never asked for. */
  sellsOnline: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<DraftProduct[]>([]);
  const [namingCount, setNamingCount] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(id: string, changes: Partial<DraftProduct>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  }

  async function handleFiles(files: File[]) {
    setError(null);
    const usable = files.filter((f) => ACCEPTED.includes(f.type));
    if (usable.length === 0) {
      setError("Use JPG, PNG or WebP photos of your products.");
      return;
    }
    if (usable.length < files.length) {
      setError(
        `${files.length - usable.length} photo${files.length - usable.length === 1 ? "" : "s"} skipped. Use JPG, PNG or WebP.`
      );
    }

    // Every photo becomes a draft immediately. The merchant sees their
    // shelf on screen straight away rather than watching a spinner decide
    // whether their work counted.
    const queued: DraftProduct[] = [];
    for (const file of usable) {
      // Downscaled here, before anything leaves the phone, so the merchant
      // never pays to upload eight megabytes of a bottle.
      const prepared = await prepareImage(file).catch(() => null);
      if (!prepared) continue;
      queued.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        photoDataUrl: prepared.previewUrl,
        photoBase64: prepared.base64,
        mediaType: prepared.mediaType,
        suggestion: null,
        name: "",
        description: "",
        price: "",
        saved: false,
        status: "naming",
      });
    }
    if (queued.length === 0) {
      setError("Those photos could not be opened. Try again.");
      return;
    }

    setDrafts((prev) => [...prev, ...queued]);
    setNamingCount((n) => n + queued.length);

    // One at a time. The model is rate limited, and a batch fired in
    // parallel fails as a batch.
    let halted: string | null = null;
    for (const draft of queued) {
      if (halted) {
        patch(draft.id, { status: "needs_name", note: halted });
        setNamingCount((n) => n - 1);
        continue;
      }
      const outcome = await nameOne(draft);
      if (outcome.stopBatch) halted = outcome.note ?? null;
      setNamingCount((n) => n - 1);
    }
  }

  async function nameOne(
    draft: DraftProduct
  ): Promise<{ stopBatch: boolean; note?: string }> {
    try {
      const res = await fetch("/api/shop/catalogue-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: draft.photoBase64,
          mediaType: draft.mediaType,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.suggestion) {
        const note =
          data?.error ?? "We could not read this photo. Give it a name yourself.";
        patch(draft.id, { status: "needs_name", note });
        // Rate limited or misconfigured: the rest of the batch will fail
        // the same way, so stop asking and let them all be named by hand.
        return { stopBatch: res.status === 429 || res.status === 503, note };
      }

      const s: Suggestion = data.suggestion;
      patch(draft.id, {
        suggestion: s,
        name: s.name,
        description: s.description,
        status: "ready",
        note: undefined,
      });
      return { stopBatch: false };
    } catch {
      patch(draft.id, {
        status: "needs_name",
        note: "We could not reach the network. Give it a name yourself.",
      });
      return { stopBatch: false };
    }
  }

  async function saveDraft(draft: DraftProduct): Promise<boolean> {
    const price = parseFloat(draft.price);
    if (!(price > 0)) {
      setError("Set a price above zero, in GHS.");
      return false;
    }
    if (draft.name.trim().length < 2) {
      setError("Give the product a name your customers will recognise.");
      return false;
    }

    setSaving(draft.id);
    try {
      // The photo goes up first. If storage refuses, the product still
      // saves without a picture rather than the merchant losing the work
      // of naming and pricing it.
      let photoUrl: string | null = null;
      try {
        const up = await fetch("/api/catalogue/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            imageBase64: draft.photoBase64,
            mediaType: draft.mediaType,
          }),
        });
        const upData = await up.json().catch(() => null);
        if (up.ok && upData?.url) photoUrl = upData.url;
      } catch {
        // Saved without a picture; said plainly below.
      }

      const res = await fetch("/api/shop/catalogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          name: draft.name,
          description: draft.description,
          category: draft.suggestion?.category ?? null,
          price,
          photoUrl,
          media: photoUrl ? [photoUrl] : [],
          aiSuggestion: draft.suggestion ?? undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not save this product just now. Tap again.");
        return false;
      }
      patch(draft.id, { saved: true });
      if (!photoUrl) {
        setError(
          "Saved, but the picture did not upload. You can add it again later."
        );
      }
      return true;
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      return false;
    } finally {
      setSaving(null);
    }
  }

  // With a shelf's worth of photos on screen, saving them one at a time is
  // the tedious part. Anything with a name and a price goes in one go.
  async function saveAllReady() {
    const ready = drafts.filter(
      (d) => !d.saved && d.name.trim().length >= 2 && parseFloat(d.price) > 0
    );
    if (ready.length === 0) {
      setError("Put a price on at least one product first.");
      return;
    }
    setSavingAll(true);
    setError(null);
    let failed = 0;
    for (const draft of ready) {
      const ok = await saveDraft(draft);
      if (!ok) failed += 1;
    }
    setSavingAll(false);
    if (failed === 0) setError(null);
  }

  const savedCount = drafts.filter((d) => d.saved).length;
  const unsaved = drafts.filter((d) => !d.saved);
  const readyToSave = unsaved.filter(
    (d) => d.name.trim().length >= 2 && parseFloat(d.price) > 0
  ).length;

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-5 pb-24 pt-14">
        <p className="text-sm font-medium text-teal-dark">
          {sellsOnline ? "Ascend Shop" : "What you sell"}
        </p>
        <h1 className="mt-6 text-3xl font-semibold leading-display text-ink">
          {sellsOnline
            ? "Your photos become your Shop."
            : "Your photos become what you sell."}
        </h1>
        <p className="mt-3 text-ink-muted">
          Add photos of everything you sell, as many at once as you like. We
          suggest the name and description, you approve and set the price.{" "}
          {sellsOnline
            ? "Your Shop preview builds as you go."
            : "Each one reaches your till on its next sync."}
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) handleFiles(files);
            e.target.value = "";
          }}
        />

        <button
          onClick={() => fileInput.current?.click()}
          disabled={namingCount > 0}
          className="tap mt-8 w-full border-2 border-dashed border-teal bg-teal-light px-4 py-8 font-medium text-teal-dark disabled:opacity-60"
        >
          {namingCount > 0
            ? `Naming your photos... ${namingCount} to go`
            : drafts.length > 0
              ? "Add more photos"
              : "Add product photos"}
        </button>

        {error && <p className="mt-3 text-sm text-gold-dark">{error}</p>}

        {readyToSave > 1 && (
          <button
            onClick={saveAllReady}
            disabled={savingAll}
            className="tap mt-3 w-full bg-teal px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {savingAll
              ? "Saving your products..."
              : `Save all ${readyToSave} that have prices`}
          </button>
        )}

        <div className="mt-8 space-y-6">
          {drafts.map((draft) => (
            <div key={draft.id} className="border border-line">
              <img
                src={draft.photoDataUrl}
                alt=""
                className="h-48 w-full bg-light-grey object-cover"
              />

              <div className="p-4">
                {draft.saved ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{draft.name}</p>
                      <p className="text-sm text-teal-dark">
                        {sellsOnline ? "In your Shop" : "Ready to sell"}
                      </p>
                    </div>
                    <p className="num shrink-0 font-semibold text-ink">
                      {formatGHS(parseFloat(draft.price))}
                    </p>
                  </div>
                ) : draft.status === "naming" ? (
                  <p className="py-4 text-center text-sm text-ink-muted">
                    Reading this photo...
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-ink-muted">
                      {draft.status === "needs_name"
                        ? (draft.note ?? "Give this one a name yourself.")
                        : "Our suggestion, yours to change"}
                    </p>

                    <input
                      value={draft.name}
                      onChange={(e) => patch(draft.id, { name: e.target.value })}
                      placeholder="What is this product called?"
                      className="mt-2 w-full border border-line px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />

                    <textarea
                      value={draft.description}
                      onChange={(e) => patch(draft.id, { description: e.target.value })}
                      rows={3}
                      placeholder="A line or two about it, if you want one"
                      className="mt-2 w-full resize-y border border-line px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none"
                    />

                    <input
                      value={draft.price}
                      onChange={(e) =>
                        patch(draft.id, { price: e.target.value.replace(/[^\d.]/g, "") })
                      }
                      inputMode="decimal"
                      placeholder="Your price in GHS"
                      className="num mt-2 w-full border border-line px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />

                    {draft.suggestion?.suggested_price_note && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {draft.suggestion.suggested_price_note}
                      </p>
                    )}

                    <button
                      onClick={() => saveDraft(draft)}
                      disabled={saving === draft.id || savingAll}
                      className="tap mt-3 w-full bg-teal px-4 py-3 font-medium text-white disabled:opacity-60"
                    >
                      {saving === draft.id
                        ? "Saving this product..."
                        : sellsOnline
                          ? "Approve and add to my Shop"
                          : "Approve and add to what I sell"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {savedCount > 0 && (
          <div className="mt-10 border-t border-line pt-6">
            <p className="text-sm text-ink-muted">
              {savedCount} product{savedCount > 1 ? "s" : ""} saved.{" "}
              {sellsOnline
                ? "Add a few more, then share your Shop link on WhatsApp."
                : "Add a few more, or go and set your counts."}
            </p>
            <a
              href={sellsOnline ? "/orders" : "/products"}
              className="tap mt-3 block w-full border border-teal px-4 py-3 text-center font-medium text-teal-dark"
            >
              {sellsOnline ? "See my Shop preview" : "Go to my products"}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
