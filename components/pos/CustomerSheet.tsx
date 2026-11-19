"use client";

// Who this sale is for. Search by name or by the number the way people say
// it ("0244 12"), pick them, or add someone new with their phone. Works
// with no network: the list is on the till (lib/pos/customers.ts).

import { useMemo, useState } from "react";
import { searchCustomers, sayPhone, isAddedHere } from "@/lib/pos/customers";
import { initials } from "@/lib/pos/cash";
import { Icon } from "@/components/shell/icons";
import TillSheet from "@/components/pos/TillSheet";
import type { Till } from "@/lib/pos/useTill";

export default function CustomerSheet({ till, onClose }: { till: Till; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = useMemo(() => searchCustomers(till.customers, query), [till.customers, query]);

  async function add() {
    const result = await till.addCustomer(name, phone);
    if (!result.ok) return setError(result.error);
    onClose();
  }

  return (
    <TillSheet title={adding ? "Add a customer" : "Who is this sale for?"} onClose={onClose}>
      {adding ? (
        <div className="flex flex-col gap-3 p-4">
          <label className="text-[13.5px] font-semibold text-ink" htmlFor="newName">
            Their name
          </label>
          <input
            id="newName"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Efua Asare"
            className="-mt-1.5 h-12 rounded-control border-[1.5px] border-line-brand px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
          <label className="text-[13.5px] font-semibold text-ink" htmlFor="newPhone">
            Their phone number
          </label>
          <input
            id="newPhone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="024 123 4567"
            className="-mt-1.5 h-12 rounded-control border-[1.5px] border-line-brand px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
          <p className="text-[12.5px] text-neutral-600">
            The number is how we know them next time, so the same person is never added twice.
          </p>
          {error && <p className="text-[13.5px] font-semibold text-gold-700">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="tap flex h-12 flex-1 items-center justify-center rounded-control border-[1.5px] border-neutral-200 text-[14px] font-bold text-ink"
            >
              Back to the list
            </button>
            <button
              onClick={add}
              className="tap flex h-12 flex-[2] items-center justify-center rounded-control bg-teal text-[14.5px] font-bold text-white"
            >
              Put them on this sale
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-none gap-2 p-3">
            <label className="flex h-12 flex-1 items-center gap-2 rounded-control border-[1.5px] border-line-brand px-3 text-neutral-500 focus-within:border-teal">
              <Icon name="search" size={17} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or phone number"
                aria-label="Find a customer by name or phone number"
                className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-neutral-500 focus:outline-none"
              />
            </label>
            <button
              onClick={() => {
                setAdding(true);
                const digits = query.replace(/[^\d+]/g, "");
                if (digits.length >= 6) setPhone(query);
                else if (query.trim()) setName(query.trim());
              }}
              className="tap flex h-12 flex-none items-center gap-1.5 rounded-control bg-teal px-3.5 text-[13.5px] font-bold text-white"
            >
              <Icon name="plus" size={16} />
              New
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100">
            {till.customer && (
              <button
                onClick={() => {
                  till.setCustomer(null);
                  onClose();
                }}
                className="tap flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left text-[14px] font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Take {till.customer.name} off this sale
              </button>
            )}
            {matches.length === 0 && (
              <p className="px-4 py-8 text-center text-[14px] text-neutral-600">
                {till.customers.length === 0
                  ? "No customers on this till yet. Add the first one."
                  : "Nobody matches that. Add them as a new customer."}
              </p>
            )}
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  till.setCustomer(c);
                  onClose();
                }}
                className={`tap flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left hover:bg-teal-50 ${
                  till.customer?.id === c.id ? "bg-teal-50" : ""
                }`}
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal-50 text-[12px] font-bold text-teal-800">
                  {initials(c.name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{c.name}</span>
                  <span className="num text-[12.5px] text-neutral-500">
                    {sayPhone(c.phone) || "No number"}
                    {isAddedHere(c) ? " · added on this till" : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </TillSheet>
  );
}
