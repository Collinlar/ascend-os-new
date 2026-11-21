"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

// A stock count, in one sitting (Inventory Core I4). Blind on purpose: the
// person counting sees each product and a box, never what the record says,
// so the number they type is what is on the shelf. Leaving a product blank
// leaves it out of this count.

interface Item {
  id: string;
  name: string;
  category: string | null;
}

type Result = {
  status: "posted" | "waiting";
  lines: number;
  differing: number;
  write_down_value: number;
  write_up_value: number;
  needs_second_person: boolean;
};

const numeric = (v: string) => v.replace(/[^\d.]/g, "");

export default function CountForm({
  businessId,
  places,
  counted,
  uncounted,
  canPost,
}: {
  businessId: string;
  places: { id: string; name: string }[];
  counted: Item[];
  uncounted: Item[];
  canPost: boolean;
}) {
  const router = useRouter();
  const [placeId, setPlaceId] = useState(places[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());

  const list = useMemo(() => {
    const all = showAll ? [...counted, ...uncounted] : counted;
    const q = search.trim().toLowerCase();
    return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
  }, [counted, uncounted, showAll, search]);
  const filled = Object.entries(values).filter(([, v]) => v !== "");

  async function send() {
    setError(null);
    if (filled.length === 0) return setError("Type what you counted for at least one product.");
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId: placeId,
          clientRef,
          note: note.trim(),
          lines: filled.map(([itemId, v]) => ({ itemId, counted: Number(v) })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "We could not save your count just now. Your numbers are still here. Tap send again.");
      setResult(body as Result);
      setValues({});
      setNote("");
      setClientRef(crypto.randomUUID());
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Your numbers are still here. Check your connection and tap send again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const agrees = result.differing === 0;
    return (
      <div className="rounded-[18px] border border-line-brand bg-white px-5 py-6">
        <p className="font-heading text-lg font-bold text-ink-heading">
          {result.lines} {result.lines === 1 ? "product" : "products"} counted.
        </p>
        <p className="mt-1.5 text-[14px] text-neutral-700">
          {agrees
            ? "Every count matched the record. Nothing needed changing."
            : result.status === "posted"
              ? `${result.differing} ${result.differing === 1 ? "product differed" : "products differed"} and the shelf now matches what you counted.`
              : result.needs_second_person
                ? `${result.differing} ${result.differing === 1 ? "product differed" : "products differed"}, writing off ${formatGHS(result.write_down_value)}. Because that is more than GHS 500, someone other than you must approve it before the shelf changes.`
                : `${result.differing} ${result.differing === 1 ? "product differed" : "products differed"}. The owner or a manager approves it in Inventory before the shelf changes.`}
        </p>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="tap mt-4 flex min-h-[44px] items-center rounded-control border-[1.5px] border-line-brand px-4 text-[14px] font-bold text-teal-800"
        >
          Count more products
        </button>
      </div>
    );
  }

  const field = "h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {places.length > 1 && (
          <label className="text-[13px] font-semibold text-neutral-700">
            Which place are you counting?
            <select value={placeId} onChange={(e) => { setPlaceId(e.target.value); setValues({}); }} className={`mt-1 ${field}`}>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-[13px] font-semibold text-neutral-700">
          Find a product
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rice, Milo, soap" className={`mt-1 ${field}`} />
        </label>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-line-brand bg-white">
        {list.length === 0 && <p className="px-5 py-6 text-[14px] text-neutral-600">No product matches that.</p>}
        {list.map((i, n) => (
          <label key={i.id} className={`flex items-center justify-between gap-4 px-5 py-2.5 ${n > 0 ? "border-t border-neutral-100" : ""}`}>
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-semibold text-ink">{i.name}</span>
              {i.category && <span className="block text-[12px] text-neutral-600">{i.category}</span>}
            </span>
            <input
              value={values[i.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [i.id]: numeric(e.target.value) }))}
              inputMode="decimal"
              placeholder="Count"
              aria-label={`How many ${i.name} are on the shelf`}
              className="num h-11 w-24 flex-none rounded-control border-[1.5px] border-line-brand bg-white px-3 text-right text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
          </label>
        ))}
      </div>

      {uncounted.length > 0 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="tap -mt-1 flex min-h-[44px] items-center self-start text-[13.5px] font-semibold text-teal-800">
          {showAll ? "Only the products you already count" : `Also count the ${uncounted.length} you do not track yet`}
        </button>
      )}

      <label className="text-[13px] font-semibold text-neutral-700">
        Anything to say about this count?
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Friday close, back store included" className={`mt-1 ${field}`} />
      </label>

      {error && (
        <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-5 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
          {busy ? "Checking your count..." : `Send my count${filled.length ? ` of ${filled.length}` : ""}`}
        </button>
        <p className="text-[12.5px] text-neutral-600">
          {canPost ? "Differences change the shelf at once, unless they write off more than GHS 500." : "The owner or a manager approves it before the shelf changes."}
        </p>
      </div>
    </div>
  );
}
