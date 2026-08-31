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
};

export default function ServiceManager({
  businessId,
  services,
}: {
  businessId: string;
  services: ServiceRow[];
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
            className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover"
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
        <div className="mb-3.5 rounded-[18px] border border-line-soft bg-white p-5 shadow-lift">
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
                Cancel
              </button>
            </div>
          </div>
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
                i < rows.length - 1 ? "border-b border-[#EEF3F7]" : ""
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
                  className="tap flex items-center rounded-chip bg-teal-light px-4 text-[13px] font-bold text-teal-dark hover:bg-teal-pale"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setActive(row, !row.active)}
                  disabled={busy}
                  className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey disabled:opacity-60"
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
