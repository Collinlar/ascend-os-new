"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState, Panel as Surface } from "@/components/shell/Page";
import type { ServiceRow } from "@/app/api/services/offerings/route";

// What you offer, and what each one costs somebody in time and money.
//
// A service is a catalogue item like any other. The three things that make
// it bookable are here because they are the three a customer is committing
// to: how long they are giving up, what it costs, and what is due now.

const BLANK = {
  name: "",
  description: "",
  price: "",
  durationMinutes: "60",
  bufferMinutes: "0",
  depositAmount: "",
  bookingModel: "fixed_slot" as "fixed_slot" | "class_session" | "quote_first",
  homeEnabled: false,
  travelFee: "",
  areas: "",
  depositPercent: "30",
};

export default function ServiceManager({
  businessId,
  services,
  businessName = "",
  placeNames = [],
}: {
  businessId: string;
  services: ServiceRow[];
  /** For the preview of what customers see (Modules M4). */
  businessName?: string;
  placeNames?: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(services);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setForm({ ...BLANK });
    setEditing("new");
    setError(null);
  }

  function openEdit(row: ServiceRow) {
    setForm({
      name: row.name,
      description: row.description ?? "",
      price: row.price === null ? "" : String(row.price),
      durationMinutes: String(row.durationMinutes),
      bufferMinutes: String(row.bufferMinutes),
      depositAmount: row.depositAmount === null ? "" : String(row.depositAmount),
      bookingModel: row.bookingModel ?? "fixed_slot",
      homeEnabled: row.home?.enabled ?? false,
      travelFee: row.home?.enabled ? String(row.home.travelFee) : "",
      areas: row.home?.areas ?? "",
      depositPercent: row.depositPercent === null || row.depositPercent === undefined ? "30" : String(row.depositPercent),
    });
    setEditing(row.id);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      businessId,
      ...(editing !== "new" ? { itemId: editing } : {}),
      name: form.name,
      description: form.description.trim() || null,
      price: form.price.trim() === "" ? null : Number(form.price),
      durationMinutes: Number(form.durationMinutes),
      bufferMinutes: Number(form.bufferMinutes || 0),
      depositAmount: form.depositAmount.trim() === "" ? null : Number(form.depositAmount),
      bookingModel: form.bookingModel,
      home: { enabled: form.bookingModel === "fixed_slot" && form.homeEnabled, travelFee: Number(form.travelFee || 0), areas: form.areas },
      depositPercent: form.bookingModel === "quote_first" ? Number(form.depositPercent || 0) : null,
    };

    try {
      const res = await fetch("/api/services/offerings", {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not save that. Tap save again.");
        return;
      }
      const saved: ServiceRow = data.service;
      setRows((prev) =>
        editing === "new"
          ? [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
          : prev.map((r) => (r.id === saved.id ? saved : r))
      );
      setEditing(null);
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap save again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(row: ServiceRow, active: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services/offerings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, itemId: row.id, active }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not change that. Tap again.");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? data.service : r)));
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">
            What you offer
          </h2>
          <p className="mt-0.5 text-sm font-medium text-slate-grey">
            Nothing can be booked until something is listed here.
          </p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="tap flex items-center rounded-control bg-teal px-4 text-[13.5px] font-bold text-white hover:bg-teal-hover"
          >
            Add a service
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2.5 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      {editing !== null && (
        <div className="mb-3.5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[18px] border border-line-brand bg-white p-5">
          <div className="flex flex-col gap-4">
            <Field
              id="svc-name"
              label="What is it called?"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Ladies haircut"
            />
            <Field
              id="svc-desc"
              label="What does it include?"
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              placeholder="Wash, cut and style"
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="svc-duration"
                label="How long, in minutes"
                value={form.durationMinutes}
                onChange={(v) => setForm((f) => ({ ...f, durationMinutes: v }))}
                placeholder="60"
                numeric
              />
              <Field
                id="svc-buffer"
                label="Gap after, in minutes"
                value={form.bufferMinutes}
                onChange={(v) => setForm((f) => ({ ...f, bufferMinutes: v }))}
                placeholder="0"
                numeric
              />
              <Field
                id="svc-price"
                label="Price in GHS"
                value={form.price}
                onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                placeholder="80"
                numeric
              />
            </div>

            {/* How it is booked (round 4, S3). */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-bold text-ink-muted">How customers book it</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["fixed_slot", "Pick a time", "They choose a free time with you"],
                    ["class_session", "A class", "You schedule classes; they book seats"],
                    ["quote_first", "Quote first", "They tell you about the day; you send a quotation"],
                  ] as Array<["fixed_slot" | "class_session" | "quote_first", string, string]>
                ).map(([k, l, d]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={form.bookingModel === k}
                    onClick={() => setForm((f) => ({ ...f, bookingModel: k }))}
                    className={`tap flex flex-col items-start gap-0.5 rounded-control border-[1.5px] px-3 py-2.5 text-left ${form.bookingModel === k ? "border-teal bg-teal-50" : "border-line bg-white"}`}
                  >
                    <span className="text-[13.5px] font-bold text-ink">{l}</span>
                    <span className="text-[12px] text-neutral-600">{d}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {form.bookingModel === "fixed_slot" && (
              <div className="flex flex-col gap-2.5 rounded-control border border-line px-3.5 py-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={form.homeEnabled} onChange={(e) => setForm((f) => ({ ...f, homeEnabled: e.target.checked }))} className="h-5 w-5 accent-teal-700" />
                  <span className="text-[13.5px] font-semibold text-ink">Also at the customer&apos;s home</span>
                </label>
                {form.homeEnabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="svc-travel" label="Travel fee in GHS" value={form.travelFee} onChange={(v) => setForm((f) => ({ ...f, travelFee: v }))} placeholder="60" numeric />
                    <Field id="svc-areas" label="Where you go" value={form.areas} onChange={(v) => setForm((f) => ({ ...f, areas: v }))} placeholder="Within Accra" />
                    <p className="text-[12px] text-neutral-600 sm:col-span-2">A home booking comes to you as a request. You accept it once you have checked the address.</p>
                  </div>
                )}
              </div>
            )}

            {form.bookingModel === "quote_first" && (
              <Field
                id="svc-deposit-pct"
                label="Deposit when they accept your quotation, in percent"
                value={form.depositPercent}
                onChange={(v) => setForm((f) => ({ ...f, depositPercent: v }))}
                placeholder="30"
                numeric
              />
            )}

            {form.bookingModel === "class_session" && (
              <p className="text-[12.5px] text-neutral-600">The price is for one seat. Schedule each class below once it is saved.</p>
            )}

            <Field
              id="svc-deposit"
              label="Deposit to hold the slot, if you take one"
              value={form.depositAmount}
              onChange={(v) => setForm((f) => ({ ...f, depositAmount: v }))}
              placeholder="Leave empty to take nothing up front"
              numeric
            />

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="tap flex items-center rounded-control bg-teal px-[22px] text-[13.5px] font-bold text-white hover:bg-teal-hover disabled:opacity-60"
              >
                {busy ? "Saving..." : editing === "new" ? "Add this service" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="tap flex items-center rounded-control border border-line px-[18px] text-[13.5px] font-bold text-ink-slate"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
        <Preview form={form} businessName={businessName} placeNames={placeNames} />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to book yet."
          detail="Add what you do, how long it takes and what it costs. Your booking page stays empty until you do."
        />
      ) : (
        <Surface>
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-[22px] py-4 ${
                i < rows.length - 1 ? "border-b border-line-soft" : ""
              } ${row.active ? "" : "opacity-60"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold leading-snug tracking-[-0.01em] text-ink">
                  {row.name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="num text-[13.5px] font-bold text-teal-dark">
                    {row.price === null ? "No price set" : formatGHS(row.price)}
                  </span>
                  <span className="text-[12.5px] font-semibold text-slate-grey">
                    {row.durationMinutes} min
                    {row.bufferMinutes > 0 && ` · ${row.bufferMinutes} min gap after`}
                  </span>
                  {row.depositAmount !== null && (
                    <span className="num rounded-full bg-teal-light px-2 py-0.5 text-[11.5px] font-bold text-teal-dark">
                      {formatGHS(row.depositAmount)} to hold
                    </span>
                  )}
                  {!row.active && (
                    <span className="text-[12.5px] font-semibold text-slate-grey">
                      Not offered
                    </span>
                  )}
                </div>
              </div>

              <div className="flex w-full flex-none justify-end gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="tap flex items-center rounded-control bg-teal-50 px-4 text-[13px] font-bold text-teal-800 hover:bg-teal-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setActive(row, !row.active)}
                  disabled={busy}
                  className="tap flex items-center rounded-control border border-line-brand px-4 text-[13px] font-bold text-teal-800 hover:border-teal-brand disabled:opacity-60"
                >
                  {row.active ? "Stop offering" : "Offer again"}
                </button>
              </div>
            </div>
          ))}
        </Surface>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  numeric = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={numeric ? "decimal" : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1.5 w-full rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal ${
          numeric ? "num" : ""
        }`}
      />
    </div>
  );
}

// What a customer sees on the booking page as the form is filled in
// (Modules M4). Times are not invented here: they come from availability.
function Preview({
  form,
  businessName,
  placeNames,
}: {
  form: typeof BLANK;
  businessName: string;
  placeNames: string[];
}) {
  const minutes = Number(form.durationMinutes) || 0;
  const length =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) === 1 ? "" : "s"}${minutes % 60 ? ` ${minutes % 60} min` : ""}`
      : `${minutes} min`;
  const price = form.price.trim() === "" ? null : Number(form.price);
  const deposit = form.depositAmount.trim() === "" ? null : Number(form.depositAmount);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-neutral-600">What customers see</span>
      <div className="flex flex-col gap-2.5 rounded-[18px] border border-line-brand bg-white p-4 shadow-card">
        <span className="self-start rounded-full bg-neutral-100 px-2.5 py-1 text-[11.5px] font-semibold text-neutral-700">{length}</span>
        <strong className="text-[15px] text-ink">{form.name.trim() || "Your service"}</strong>
        {form.description.trim() && <span className="text-[13px] text-neutral-700">{form.description}</span>}
        {(businessName || placeNames.length > 0) && (
          <span className="text-xs text-neutral-600">
            {[businessName, placeNames.join(", ")].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <strong className="num text-[15px] text-ink">{price === null || Number.isNaN(price) ? "Price on asking" : formatGHS(price)}</strong>
          {deposit !== null && deposit > 0 && (
            <span className="num rounded-full bg-teal-100 px-2 py-0.5 text-[11.5px] font-bold text-teal-800">{formatGHS(deposit)} to hold</span>
          )}
        </span>
        <span className="text-xs text-neutral-600">They pick a time from your availability.</span>
        <span className="flex min-h-[40px] items-center justify-center rounded-control bg-teal px-3 text-[13px] font-bold text-white">
          {deposit !== null && deposit > 0 ? `Book and pay ${formatGHS(deposit)} now` : "Book this time"}
        </span>
      </div>
    </div>
  );
}
