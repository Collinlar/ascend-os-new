"use client";

// Keeps the customer display in step with the till. Both layouts call it
// with where the cashier is (selling, taking payment, done); everything else
// comes from the till engine.

import { useEffect, useMemo, useRef } from "react";
import { displaySender, type DisplayState } from "@/lib/pos/display";
import type { Till } from "@/lib/pos/useTill";

export function useCustomerDisplay(till: Till, where: { paying: boolean; done: boolean; method?: string }) {
  const { device, cashier, cart, subtotal, total, discount, customer, lastReceipt } = till;

  const state = useMemo<DisplayState>(() => {
    const business = device?.businessName ?? device?.label ?? "Ascend POS";
    const servedBy = cashier?.displayName.split(" ")[0];
    const customerFirst = customer?.name.split(" ")[0];
    if (where.done && lastReceipt) {
      const doc = lastReceipt.doc;
      return {
        stage: "thanks",
        business,
        servedBy,
        lines: doc.lines.map((l) => ({ qty: l.quantity, name: l.name, total: l.amount })),
        subtotal: doc.subtotal,
        discount: doc.discount ? { label: "Discount", amount: doc.discount } : undefined,
        total: doc.total,
        customerFirst: doc.customerName?.split(" ")[0],
        change: doc.change && doc.change > 0 ? doc.change : undefined,
        sentAt: Date.now(),
      };
    }
    return {
      stage: cart.length === 0 ? "welcome" : where.paying ? "paying" : "sale",
      business,
      servedBy,
      lines: cart.map((l) => ({ qty: l.quantity, name: l.item.name, total: Math.round(l.item.price * l.quantity * 100) / 100 })),
      subtotal,
      discount: discount ? { label: `Discount ${discount.label}`, amount: discount.amount } : undefined,
      total,
      customerFirst,
      method: where.paying ? where.method : undefined,
      sentAt: Date.now(),
    };
  }, [device, cashier, cart, subtotal, total, discount, customer, lastReceipt, where.paying, where.done, where.method]);

  const latest = useRef(state);
  latest.current = state;
  const sender = useRef<ReturnType<typeof displaySender> | null>(null);

  useEffect(() => {
    sender.current = displaySender(() => latest.current);
    return () => sender.current?.close();
  }, []);

  useEffect(() => {
    sender.current?.send(state);
  }, [state]);
}
