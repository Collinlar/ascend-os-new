"use client";

// Who the sale is for, and anything taken off it: the two rows both tills
// show with the sale.

import { formatGHS } from "@/lib/money";
import { initials } from "@/lib/pos/cash";
import { sayPhone } from "@/lib/pos/customers";
import { Icon } from "@/components/shell/icons";
import type { Till } from "@/lib/pos/useTill";

export function CustomerRow({ till, onOpen }: { till: Till; onOpen: () => void }) {
  const c = till.customer;
  return (
    <button
      onClick={onOpen}
      className={`tap flex w-full items-center gap-3 rounded-control px-3 py-2 text-left ${
        c ? "border-[1.5px] border-teal-200 bg-teal-50" : "border-[1.5px] border-dashed border-neutral-300 bg-white"
      }`}
    >
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12px] font-bold ${
          c ? "bg-teal text-white" : "bg-neutral-100 text-neutral-600"
        }`}
      >
        {c ? initials(c.name) : <Icon name="users" size={16} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold text-ink">{c ? c.name : "Add a customer"}</span>
        <span className="num truncate text-[12px] text-neutral-600">
          {c ? sayPhone(c.phone) || "No number" : "Needed for credit. Optional otherwise."}
        </span>
      </span>
      <span className="text-[12.5px] font-bold text-teal-700">{c ? "Change" : "Find"}</span>
    </button>
  );
}

export function DiscountRow({ till, onOpen }: { till: Till; onOpen: () => void }) {
  const d = till.discount;
  if (!d) {
    return (
      <button
        onClick={onOpen}
        disabled={till.cart.length === 0}
        className="tap flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-teal-700 disabled:opacity-40"
      >
        <Icon name="tag" size={15} />
        Add a discount
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 text-[13.5px]">
      <button onClick={onOpen} className="tap flex min-w-0 flex-col items-start text-left">
        <span className="font-semibold text-ink">Discount {d.label}</span>
        <span className="truncate text-[12px] text-neutral-600">Allowed by {d.approvedByName}</span>
      </button>
      <span className="num font-bold text-danger-ink">−{formatGHS(d.amount)}</span>
    </div>
  );
}
