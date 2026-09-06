"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, PanelRow } from "@/components/shell/Page";

// Where the business trades from (Office PRD 24).
//
// 31 location rows are in use across POS and Services and there has never
// been a way to add or rename one: they were created during setup and then
// frozen. A business that opens a second shop had nowhere to say so.
//
// It sits with the team rather than on its own screen because both answer
// the same question, which is how the business is arranged.

export interface LocationRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  active: boolean;
  /** Whether a till or a booking currently points at it. */
  inUse: boolean;
}

export default function Locations({
  locations,
  canManage,
}: {
  locations: LocationRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open(row?: LocationRow) {
    setError(null);
    if (row) {
      setEditing(row.id);
      setAdding(false);
      setName(row.name);
      setAddress(row.address ?? "");
      setCity(row.city ?? "");
    } else {
      setAdding(true);
      setEditing(null);
      setName("");
      setAddress("");
      setCity("");
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/office/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_location",
          locationId: editing ?? undefined,
          name,
          address,
          city,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save that. Tap again.");
        return;
      }
      setEditing(null);
      setAdding(false);
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const form = (
    <div className="rounded-[18px] border border-line-soft bg-white p-5 shadow-lift">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What you call this place"
          aria-label="Location name"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Town or city"
          aria-label="City"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Where to find it"
          aria-label="Address"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none sm:col-span-2"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy === "save"}
          className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover disabled:opacity-60"
        >
          {busy === "save" ? "Saving..." : "Save this place"}
        </button>
        <button
          onClick={() => {
            setEditing(null);
            setAdding(false);
          }}
          className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <section className="mt-8">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">
            Where you trade
          </h2>
          <p className="text-[13px] font-medium text-slate-grey">
            Tills, bookings and stock all belong to one of these.
          </p>
        </div>
        {canManage && !adding && !editing && (
          <button
            onClick={() => open()}
            className="tap flex items-center text-[13px] font-bold text-teal-dark"
          >
            Add a place
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3.5 border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}

      {(adding || editing) && <div className="mb-3.5">{form}</div>}

      <Panel>
        {locations.map((l, i) => (
          <PanelRow key={l.id} last={i === locations.length - 1}>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-snug text-ink">
                {l.name}
                {!l.active && (
                  <span className="ml-2 text-[12px] font-bold text-slate-grey">
                    closed
                  </span>
                )}
              </p>
              <p className="text-[12.5px] font-medium text-slate-grey">
                {[l.address, l.city].filter(Boolean).join(", ") || "No address yet"}
                {l.inUse && " · in use"}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => open(l)}
                className="tap flex flex-none items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
              >
                Change
              </button>
            )}
          </PanelRow>
        ))}
      </Panel>
    </section>
  );
}
