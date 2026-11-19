// The business's customers, kept on the till so a cashier can put a name on
// a sale with no network.
//
// Names and phone numbers only, nothing else (Collins approved this on 19
// November 2026, Data Protection Act 2012 in mind). The list is erased when
// the till is stopped or set up as a different till.
//
// A customer added at the till is not given an id here. They travel with
// their sale as a name and a phone number, and the server finds or creates
// them by phone (app/api/pos/sync). Until the next refresh they sit at the
// top of the list under a temporary key, so the same person can be picked
// again on the next sale.

import { getMeta, setMeta } from "@/lib/pos/db";
import { getDeviceToken } from "@/lib/pos/registration";
import { normalizePhone } from "@/lib/auth/phone";

const KEY = "customers";

export interface TillCustomer {
  /** The server's id, or "new:" and the phone for one added at the till. */
  id: string;
  name: string;
  phone: string | null;
}

/** Who a sale is for, as the sale carries it. */
export type SaleCustomer = { id: string; name: string } | { name: string; phone: string; isNew: true };

export function isAddedHere(c: TillCustomer): boolean {
  return c.id.startsWith("new:");
}

export function forSale(c: TillCustomer): SaleCustomer {
  return isAddedHere(c) ? { name: c.name, phone: c.phone ?? "", isNew: true } : { id: c.id, name: c.name };
}

export async function getCustomers(): Promise<TillCustomer[]> {
  return (await getMeta<TillCustomer[]>(KEY)) ?? [];
}

export async function forgetCustomers(): Promise<void> {
  await setMeta(KEY, undefined);
}

/** Refreshes the list from the server. Customers added here are kept until the server has them. */
export async function pullCustomers(): Promise<boolean> {
  const token = await getDeviceToken();
  if (!token) return false;
  try {
    const response = await fetch("/api/pos/customers", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.status === 401) {
      // A stopped till keeps nobody's phone number.
      await forgetCustomers();
      return false;
    }
    if (!response.ok) return false;
    const data = (await response.json()) as { customers: TillCustomer[] };
    const fromServer = data.customers ?? [];
    const known = new Set(fromServer.map((c) => c.phone).filter(Boolean));
    const stillLocal = (await getCustomers()).filter((c) => isAddedHere(c) && !known.has(c.phone));
    await setMeta(KEY, [...stillLocal, ...fromServer]);
    return true;
  } catch {
    return false;
  }
}

export type AddResult = { ok: true; customer: TillCustomer } | { ok: false; error: string };

/** Adds a customer at the till, or finds the one already on it with that number. */
export async function addCustomerHere(name: string, rawPhone: string): Promise<AddResult> {
  const cleanName = name.trim();
  if (cleanName.length < 2) return { ok: false, error: "Write the customer's name." };
  const phone = normalizePhone(rawPhone);
  if (!phone.ok || !phone.e164) return { ok: false, error: "That number does not look right. Try 024 123 4567." };
  const e164 = phone.e164;
  const list = await getCustomers();
  const existing = list.find((c) => c.phone === e164);
  if (existing) return { ok: true, customer: existing };
  const customer: TillCustomer = { id: `new:${e164}`, name: cleanName, phone: e164 };
  await setMeta(KEY, [customer, ...list]);
  return { ok: true, customer };
}

/** Name or phone, the way a cashier types either: "ama", "0244", "244 12". */
export function searchCustomers(list: TillCustomer[], query: string, limit = 30): TillCustomer[] {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  const digits = q.replace(/\D/g, "");
  const local = digits.startsWith("0") ? digits.slice(1) : digits;
  return list
    .filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (local.length >= 3 && c.phone && c.phone.replace(/\D/g, "").includes(local)) return true;
      return false;
    })
    .slice(0, limit);
}

/** A phone number the way people say it in Ghana: 024 412 3456. */
export function sayPhone(e164: string | null): string {
  if (!e164) return "";
  const m = e164.match(/^\+233(\d{2})(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
