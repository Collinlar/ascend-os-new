"use client";

import { useState } from "react";

export default function TrackForm({ slug }: { slug: string }) {
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reference, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.path !== "string") {
        setError(data.error ?? "That did not go through. Check both and tap again.");
        return;
      }
      window.location.assign(data.path);
    } catch {
      setError("We could not reach the shop just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={find} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700">Order reference</span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase().replace(/[^0-9A-F#]/g, "").slice(0, 9))}
          placeholder="Like 3F9A21C4"
          autoCapitalize="characters"
          className="mono h-12 rounded-[14px] border-[1.5px] border-neutral-200 px-4 text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-teal"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700">The phone number you ordered with</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="024 000 0000"
          className="h-12 rounded-[14px] border-[1.5px] border-neutral-200 px-4 text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-teal"
        />
      </label>
      {error && <p role="alert" className="rounded-[14px] bg-gold-light px-4 py-3 text-[13.5px] font-semibold text-gold-ink">{error}</p>}
      <button
        type="submit"
        disabled={busy || reference.replace("#", "").length < 8 || phone.replace(/\D/g, "").length < 9}
        className="tap flex h-12 items-center justify-center rounded-[14px] bg-teal font-bold text-white disabled:opacity-40"
      >
        {busy ? "Finding your order" : "Show my order"}
      </button>
    </form>
  );
}
