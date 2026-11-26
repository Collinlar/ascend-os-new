"use client";

// New document (round 2, R1), from the design's "New document" screen: the
// kind, where it starts from, who it is for, what is on it, dates and a
// note, how it gets paid, and a live preview of what the customer receives.
// Nothing goes out until the send button; a draft can be saved instead.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import type { NewDocumentData, StartOption } from "@/lib/documents/new";

export type NewType =
  | "quotation"
  | "invoice"
  | "proforma"
  | "receipt"
  | "purchase_order"
  | "delivery_note"
  | "credit_note";

type StartKind = keyof NewDocumentData["starts"];

interface Kind {
  label: string;
  title: string;
  party: string;
  d1: string;
  /** The second date, or null when the kind has none. */
  d2: string | null;
  prices: boolean;
  sign?: [string, string];
  starts: StartKind[];
  cta: string;
  /** Ascend can send it to the customer itself. */
  sends: boolean;
  noteHint: string;
}

const KINDS: Record<NewType, Kind> = {
  quotation: { label: "Quotation", title: "QUOTATION", party: "Prepared for", d1: "Date", d2: "Valid until", prices: true, starts: ["service_booking", "shop_order", "sale", "copy"], cta: "Send quotation", sends: true, noteHint: "Prices held until the date above. Accept and we will confirm." },
  invoice: { label: "Invoice", title: "INVOICE", party: "Bill to", d1: "Issued", d2: "Due", prices: true, starts: ["sale", "service_booking", "shop_order", "copy"], cta: "Send invoice", sends: true, noteHint: "Payment due by the date above. Thank you for your business." },
  proforma: { label: "Proforma", title: "PROFORMA INVOICE", party: "Prepared for", d1: "Date", d2: "Valid until", prices: true, starts: ["service_booking", "shop_order", "sale", "copy"], cta: "Send proforma", sends: true, noteHint: "This is not a tax invoice. An invoice follows once the order is confirmed." },
  receipt: { label: "Receipt", title: "RECEIPT", party: "Received from", d1: "Paid on", d2: null, prices: true, starts: ["sale", "service_booking", "shop_order", "copy"], cta: "Send receipt", sends: true, noteHint: "Thank you. Keep this receipt for returns." },
  purchase_order: { label: "Purchase order", title: "PURCHASE ORDER", party: "Supplier", d1: "Ordered", d2: "Deliver by", prices: true, sign: ["Authorised by", "Received by supplier"], starts: ["copy"], cta: "Make the purchase order", sends: false, noteHint: "Deliver to our shop. Quote this order number on your invoice." },
  delivery_note: { label: "Delivery note", title: "DELIVERY NOTE", party: "Deliver to", d1: "Dispatched", d2: null, prices: false, sign: ["Delivered by", "Received by customer"], starts: ["invoice", "shop_order"], cta: "Make the delivery note", sends: false, noteHint: "Check items on arrival. Tell us within 24 hours if anything is missing." },
  credit_note: { label: "Credit note", title: "CREDIT NOTE", party: "Issued to", d1: "Date", d2: null, prices: true, starts: ["invoice"], cta: "", sends: false, noteHint: "" },
};
const ORDER: NewType[] = ["quotation", "invoice", "proforma", "receipt", "purchase_order", "delivery_note", "credit_note"];

const START_LABEL: Record<StartKind, string> = {
  sale: "A POS sale",
  service_booking: "A booking",
  shop_order: "A Shop order",
  invoice: "An invoice",
  copy: "Copy a past document",
};
const START_ICON: Record<StartKind, Parameters<typeof Icon>[0]["name"]> = {
  sale: "sell",
  service_booking: "calendar",
  shop_order: "store",
  invoice: "file",
  copy: "clipboard",
};

interface Line {
  key: number;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

type Party =
  | { mode: "picked"; id: string | null; name: string; phone: string | null; email: string | null; sub: string }
  | { mode: "new"; name: string; phone: string; email: string };

const ACCRA = "Africa/Accra";
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });
const plusDays = (days: number) => new Date(Date.now() + days * 864e5).toLocaleDateString("en-CA", { timeZone: ACCRA });
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short", year: "numeric" });
const amount = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localPhone = (e164: string) =>
  e164.startsWith("+233") && e164.length === 13 ? `0${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : e164;

let nextKey = 1;

export default function NewDocument({
  data,
  initialType,
  initialFrom,
  initialCustomer = null,
}: {
  data: NewDocumentData;
  initialType: NewType;
  initialFrom: { kind: string; id: string } | null;
  /** Opened from a customer's page: they are already picked. */
  initialCustomer?: string | null;
}) {
  const router = useRouter();
  const byItem = useMemo(() => new Map(data.catalogue.map((c) => [c.id, c])), [data.catalogue]);
  const byCustomer = useMemo(() => new Map(data.customers.map((c) => [c.id, c])), [data.customers]);

  // Picking where to start fills the customer and the lines from it.
  function fromOption(option: StartOption): { lines: Line[]; party: Party | null } {
    const known = option.customerId ? byCustomer.get(option.customerId) : undefined;
    return {
      lines: option.lines.map((l) => ({
        key: nextKey++,
        itemId: l.itemId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice ? String(l.unitPrice) : "",
      })),
      party: known
        ? { mode: "picked", id: known.id, name: known.name, phone: known.phone, email: known.email, sub: known.sub }
        : null,
    };
  }

  const initial = (() => {
    if (!initialFrom) return null;
    const option = data.starts[initialFrom.kind as StartKind]?.find((o) => o.id === initialFrom.id);
    return option ? { kind: initialFrom.kind as StartKind, option, ...fromOption(option) } : null;
  })();

  const [type, setType] = useState<NewType>(initialType);
  const [start, setStart] = useState<{ kind: StartKind; option: StartOption } | null>(
    initial ? { kind: initial.kind, option: initial.option } : null
  );
  const [picking, setPicking] = useState<StartKind | null>(null);
  const [startQuery, setStartQuery] = useState("");
  const [party, setParty] = useState<Party | null>(() => {
    if (initial?.party) return initial.party;
    const c = initialCustomer ? byCustomer.get(initialCustomer) : undefined;
    return c ? { mode: "picked", id: c.id, name: c.name, phone: c.phone, email: c.email, sub: c.sub } : null;
  });
  const [partyQuery, setPartyQuery] = useState("");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [itemQuery, setItemQuery] = useState("");
  const [due, setDue] = useState(plusDays(14));
  const [deliverBy, setDeliverBy] = useState(plusDays(7));
  const [note, setNote] = useState("");
  const [sendBy, setSendBy] = useState<{ whatsapp: boolean; email: boolean } | null>(null);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind = KINDS[type];
  const isPO = type === "purchase_order";

  function pickType(t: NewType) {
    setType(t);
    setError(null);
    setPicking(null);
    // A start that does not apply to the new kind is let go, but what it
    // filled in stays, so switching kinds never empties the form.
    if (start && !KINDS[t].starts.includes(start.kind)) setStart(null);
    // A purchase order is to a supplier; a customer does not carry over.
    if ((t === "purchase_order") !== isPO) setParty(null);
  }

  function pickStart(kindKey: StartKind, option: StartOption) {
    const filled = fromOption(option);
    setStart({ kind: kindKey, option });
    setLines(filled.lines);
    if (filled.party) setParty(filled.party);
    else if (option.customerName && !isPO) setParty({ mode: "new", name: option.customerName, phone: "", email: "" });
    setPicking(null);
    setStartQuery("");
  }

  // Lines
  const total = lines.reduce((sum, l) => sum + l.quantity * (parseFloat(l.unitPrice) || 0), 0);
  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function addItem(id: string) {
    const item = byItem.get(id);
    if (!item) return;
    setLines((prev) => {
      const same = prev.find((l) => l.itemId === id);
      if (same) return prev.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key: nextKey++, itemId: id, description: item.name, quantity: 1, unitPrice: item.basePrice === null ? "" : String(item.basePrice) }];
    });
    setItemQuery("");
  }
  function addTyped(text: string) {
    setLines((prev) => [...prev, { key: nextKey++, itemId: null, description: text, quantity: 1, unitPrice: "" }]);
    setItemQuery("");
  }
  const itemMatches = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return [];
    return data.catalogue.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [itemQuery, data.catalogue]);
  const often = data.often.filter((id) => !lines.some((l) => l.itemId === id)).map((id) => byItem.get(id)!).filter(Boolean);

  function itemSub(l: Line): string {
    const item = l.itemId ? byItem.get(l.itemId) : undefined;
    if (!item) return "Typed for this document";
    if (item.kind === "service") return "Service";
    return item.left !== null ? `Catalogue · ${item.left} in stock` : "Catalogue";
  }

  // Who it is for
  const partyMatches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    const list = isPO
      ? data.suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone, email: null as string | null, sub: s.sub }))
      : data.customers;
    if (!q) return list.slice(0, 5);
    const digits = q.replace(/\s/g, "");
    return list
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").replace(/^\+233/, "0").includes(digits) || (c.phone ?? "").includes(digits))
      .slice(0, 6);
  }, [partyQuery, isPO, data.customers, data.suppliers]);

  const partyName = party?.name.trim() ?? "";
  const partyPhone = party ? (party.mode === "picked" ? party.phone : party.phone.trim() || null) : null;
  const partyEmail = party ? (party.mode === "picked" ? party.email : party.email.trim() || null) : null;
  const first = partyName.split(/\s+/)[0] || (isPO ? "the supplier" : "your customer");

  // How it goes out. Defaults to every channel the customer can be reached
  // on; the merchant can narrow it, or make it without sending ("PDF only").
  const channels = sendBy ?? { whatsapp: Boolean(partyPhone), email: Boolean(partyEmail) };
  const wa = channels.whatsapp && Boolean(partyPhone);
  const em = channels.email && Boolean(partyEmail);

  const needsStart = type === "delivery_note" && !start;
  const priced = lines.filter((l) => l.description.trim() && l.quantity > 0);

  async function save(issueNow: boolean) {
    setError(null);
    if (needsStart) return setError("A delivery note is made from an invoice or a Shop order. Pick one above.");
    if (priced.length === 0) return setError("Add at least one item before you send it.");
    if (isPO && !partyName) return setError("Say who you are ordering from.");
    if (party?.mode === "new" && !partyName) return setError("Their name is missing. Add it, or pick someone from your list.");
    setBusy(issueNow ? "send" : "draft");
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: data.businessId,
          type,
          ...(isPO
            ? { supplierName: partyName, supplierPhone: partyPhone ?? "" }
            : party?.mode === "picked" && party.id
              ? { customerId: party.id }
              : party
                ? { customerName: partyName, customerPhone: partyPhone ?? "", customerEmail: partyEmail ?? "" }
                : {}),
          lines: priced.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: parseFloat(l.unitPrice) || 0,
          })),
          note,
          ...(type === "invoice" ? { dueDate: due } : {}),
          ...(isPO ? { dueDate: deliverBy } : {}),
          ...(type === "quotation" || type === "proforma" ? { validUntil: due } : {}),
          ...(start ? { source: { type: start.kind, id: start.option.id } } : {}),
          issueNow,
          ...(issueNow && kind.sends ? { sendBy: [wa ? "whatsapp" : null, em ? "email" : null].filter(Boolean) } : {}),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.documentId) {
        setError(out.error ?? "That did not go through. Check the details and tap again.");
        setBusy(null);
        return;
      }
      // Stays busy until the document opens, so a second tap cannot make a
      // second one.
      router.push(`/documents/${out.documentId}`);
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
      setBusy(null);
    }
  }

  const accent = data.look?.accentColour || "#007A6F";
  const startList = picking
    ? data.starts[picking].filter((o) => {
        const q = startQuery.trim().toLowerCase();
        return !q || o.label.toLowerCase().includes(q) || o.sub.toLowerCase().includes(q);
      })
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* The kind */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-panel border border-line-brand bg-white p-2" role="group" aria-label="What are you making?">
        {ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => pickType(t)}
            aria-pressed={t === type}
            className={`tap min-h-[40px] rounded-[11px] px-3.5 text-[13.5px] font-bold ${t === type ? "bg-teal text-white" : "text-neutral-700 hover:bg-teal-50"}`}
          >
            {KINDS[t].label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="hidden items-center gap-1.5 pr-2 text-[12.5px] text-neutral-600 sm:flex">
          <Icon name="clock" size={14} />
          Nothing goes out until you send it
        </span>
      </div>

      {type === "credit_note" ? (
        <CreditNoteStart invoices={data.starts.invoice} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_480px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            {/* Start from */}
            <Card>
              <Label>{type === "delivery_note" ? "Make it from" : "Start from"}</Label>
              <div className="flex flex-wrap gap-1.5">
                {type !== "delivery_note" && (
                  <Chip on={!start} onClick={() => { setStart(null); setPicking(null); }} icon="plus">
                    Blank
                  </Chip>
                )}
                {kind.starts.map((k) =>
                  data.starts[k].length === 0 ? null : (
                    <Chip key={k} on={start?.kind === k || picking === k} onClick={() => { setPicking(picking === k ? null : k); setStartQuery(""); }} icon={START_ICON[k]}>
                      {start?.kind === k ? start.option.label : START_LABEL[k]}
                    </Chip>
                  )
                )}
              </div>
              {kind.starts.every((k) => data.starts[k].length === 0) && type === "delivery_note" && (
                <p className="text-[13px] text-neutral-600">
                  There is no sent invoice or Shop order to deliver against yet. Send the invoice first, then make its delivery note.
                </p>
              )}
              {picking && (
                <div className="flex flex-col gap-2 rounded-control border border-neutral-200 p-2">
                  {data.starts[picking].length > 6 && (
                    <input
                      value={startQuery}
                      onChange={(e) => setStartQuery(e.target.value)}
                      placeholder="Search by name or number"
                      aria-label={`Search ${START_LABEL[picking].toLowerCase()}`}
                      className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
                    />
                  )}
                  <div className="flex max-h-[300px] flex-col overflow-y-auto">
                    {startList.slice(0, 20).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => pickStart(picking, o)}
                        className="tap flex min-h-[48px] items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-teal-50"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={`truncate text-[13.5px] font-semibold text-ink ${/^[A-Z]{2,4}-/.test(o.label) ? "mono" : ""}`}>{o.label}</span>
                          <span className="truncate text-xs text-neutral-600">
                            {o.sub} · {o.lines.length} {o.lines.length === 1 ? "line" : "lines"}
                          </span>
                        </span>
                        <span className="num flex-none text-[13.5px] font-bold text-ink">GHS {amount(o.total)}</span>
                      </button>
                    ))}
                    {startList.length === 0 && <p className="px-2.5 py-3 text-[13px] text-neutral-600">Nothing matches that. Try their name or the number.</p>}
                  </div>
                </div>
              )}
            </Card>

            {/* Who it is for */}
            <Card>
              <div className="flex items-center justify-between gap-2">
                <H2>{kind.party}</H2>
                {party && (
                  <button type="button" onClick={() => { setParty(null); setPartyQuery(""); setSendBy(null); }} className="tap px-1 text-[13px] font-semibold text-teal-700">
                    Change
                  </button>
                )}
              </div>
              {party?.mode === "picked" ? (
                <div className="flex items-center gap-3 rounded-[14px] border border-line-brand bg-teal-50 px-3.5 py-3">
                  <Avatar name={party.name} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="truncate text-[14px] text-ink">{party.name}</strong>
                    <span className="truncate text-xs text-neutral-600">
                      {[party.phone ? localPhone(party.phone) : null, party.email].filter(Boolean).join(" · ") || "No number or email kept"}
                    </span>
                  </span>
                  <span className="hidden flex-none rounded-full bg-white px-2.5 py-1 text-[11.5px] font-bold text-teal-800 sm:inline">
                    {isPO ? "Supplier" : "From your customers"}
                  </span>
                </div>
              ) : party?.mode === "new" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={isPO ? "Supplier name" : "Their name"} value={party.name} onChange={(v) => setParty({ ...party, name: v })} placeholder={isPO ? "Who are you ordering from?" : "Who is this for?"} />
                  <Field label={isPO ? "Their phone" : "Their WhatsApp number"} value={party.phone} onChange={(v) => setParty({ ...party, phone: v })} placeholder="024 000 0000" inputMode="tel" />
                  {!isPO && (
                    <div className="sm:col-span-2">
                      <Field label="Their email, if they use one" value={party.email} onChange={(v) => setParty({ ...party, email: v })} placeholder="accounts@company.com" inputMode="email" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="flex min-h-[44px] items-center gap-2 rounded-control border border-neutral-200 px-3 focus-within:border-teal">
                    <Icon name="search" size={16} />
                    <input
                      value={partyQuery}
                      onChange={(e) => setPartyQuery(e.target.value)}
                      placeholder={isPO ? "Who are you ordering from?" : "Who is this for? Search a name or number"}
                      aria-label={isPO ? "Find a supplier" : "Find a customer"}
                      className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-neutral-500 focus:outline-none"
                    />
                  </label>
                  {partyMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setParty({ mode: "picked", id: c.id, name: c.name, phone: c.phone, email: c.email, sub: c.sub })}
                      className="tap flex min-h-[48px] items-center gap-3 rounded-[10px] px-2 py-1.5 text-left hover:bg-teal-50"
                    >
                      <Avatar name={c.name} size={32} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] font-semibold text-ink">{c.name}</span>
                        <span className="truncate text-xs text-neutral-600">{[c.phone ? localPhone(c.phone) : null, c.sub].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const q = partyQuery.trim();
                      const looksLikePhone = /^[+\d\s]{7,}$/.test(q);
                      setParty({ mode: "new", name: looksLikePhone ? "" : q, phone: looksLikePhone ? q : "", email: "" });
                    }}
                    className="tap flex min-h-[44px] items-center gap-2 rounded-[10px] px-2 text-left text-[13.5px] font-semibold text-teal-700 hover:bg-teal-50"
                  >
                    <Icon name="plus" size={16} />
                    {partyQuery.trim() && !/^[+\d\s]{7,}$/.test(partyQuery.trim())
                      ? `Add ${partyQuery.trim()} as a new ${isPO ? "supplier" : "customer"}`
                      : `Add a new ${isPO ? "supplier" : "customer"}`}
                  </button>
                </div>
              )}
              {party?.mode === "picked" && party.sub && <span className="text-xs text-neutral-600">{party.sub}</span>}
            </Card>

            {/* Items */}
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <H2>Items</H2>
                <span className="text-xs text-neutral-600">
                  {kind.prices ? "Prices come from your catalogue. Change any line for this document only." : "Quantities only. A delivery note never shows prices."}
                </span>
              </div>
              {lines.length > 0 && (
                <div className="flex flex-col">
                  <div aria-hidden className="hidden items-center gap-2.5 border-b border-neutral-100 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500 sm:flex">
                    <span className="flex-1">Item</span>
                    <span className="w-[104px] text-center">{kind.prices ? "Qty" : "Qty to deliver"}</span>
                    {kind.prices && <span className="w-[92px] text-right">Unit GHS</span>}
                    {kind.prices && <span className="w-[96px] text-right">Amount</span>}
                    <span className="w-9" />
                  </div>
                  {lines.map((l) => (
                    <div key={l.key} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-neutral-100 py-2.5 sm:flex-nowrap">
                      <span className="flex min-w-0 basis-full flex-col gap-0.5 sm:flex-1 sm:basis-auto">
                        {l.itemId ? (
                          <strong className="truncate text-[13.5px] text-ink">{l.description}</strong>
                        ) : (
                          <input
                            value={l.description}
                            onChange={(e) => setLine(l.key, { description: e.target.value })}
                            placeholder="What is this line for?"
                            aria-label="Line description"
                            className="min-h-[40px] w-full rounded-[10px] border border-neutral-200 px-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                          />
                        )}
                        <span className="text-xs text-neutral-600">{itemSub(l)}</span>
                      </span>
                      <span className="flex h-10 w-[104px] flex-none items-center rounded-[10px] border border-neutral-200">
                        <button type="button" onClick={() => setLine(l.key, { quantity: Math.max(1, l.quantity - 1) })} aria-label={`Fewer ${l.description}`} className="tap h-full w-9 text-[18px] font-bold text-neutral-700">
                          -
                        </button>
                        <span className="num flex-1 text-center text-[13.5px] font-bold text-ink" aria-live="polite">{l.quantity}</span>
                        <button type="button" onClick={() => setLine(l.key, { quantity: l.quantity + 1 })} aria-label={`More ${l.description}`} className="tap h-full w-9 text-[18px] font-bold text-neutral-700">
                          +
                        </button>
                      </span>
                      {kind.prices && (
                        <input
                          value={l.unitPrice}
                          onChange={(e) => setLine(l.key, { unitPrice: e.target.value.replace(/[^\d.]/g, "") })}
                          inputMode="decimal"
                          placeholder="Price"
                          aria-label={`Unit price for ${l.description || "this line"}`}
                          className="num h-10 w-[92px] flex-none rounded-[10px] border border-neutral-200 px-2.5 text-right text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                        />
                      )}
                      {kind.prices && (
                        <strong className="num ml-auto w-[96px] flex-none text-right text-[13.5px] text-ink sm:ml-0">
                          {amount(l.quantity * (parseFloat(l.unitPrice) || 0))}
                        </strong>
                      )}
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        aria-label={`Remove ${l.description || "this line"}`}
                        className={`tap flex h-10 w-9 flex-none items-center justify-center rounded-[10px] text-neutral-600 hover:bg-neutral-100 ${kind.prices ? "" : "ml-auto sm:ml-0"}`}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <label className="flex min-h-[44px] items-center gap-2 rounded-[11px] border-[1.5px] border-dashed border-line-brand px-3 text-teal-800 focus-within:border-teal">
                  <Icon name="search" size={16} />
                  <input
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && itemQuery.trim()) {
                        e.preventDefault();
                        if (itemMatches[0]) addItem(itemMatches[0].id);
                        else addTyped(itemQuery.trim());
                      }
                    }}
                    placeholder="Add a product or service from your catalogue"
                    aria-label="Add an item"
                    className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-neutral-500 focus:outline-none sm:text-[13.5px]"
                  />
                </label>
                {itemQuery.trim() && (
                  <div className="mt-1.5 flex flex-col overflow-hidden rounded-control border border-neutral-200 bg-white">
                    {itemMatches.map((c) => (
                      <button key={c.id} type="button" onClick={() => addItem(c.id)} className="tap flex min-h-[44px] items-center justify-between gap-3 px-3 text-left hover:bg-teal-50">
                        <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{c.name}</span>
                        <span className="num flex-none text-[13px] font-bold text-teal-800">
                          {c.basePrice === null ? "No price yet" : `GHS ${amount(c.basePrice)}`}
                        </span>
                      </button>
                    ))}
                    <button type="button" onClick={() => addTyped(itemQuery.trim())} className="tap flex min-h-[44px] items-center gap-2 border-t border-neutral-100 px-3 text-left text-[13.5px] font-semibold text-teal-700 hover:bg-teal-50">
                      <Icon name="plus" size={15} />
                      Add &ldquo;{itemQuery.trim()}&rdquo; as a line for this document
                    </button>
                  </div>
                )}
              </div>
              {often.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-neutral-600">Often added:</span>
                  {often.map((c) => (
                    <button key={c.id} type="button" onClick={() => addItem(c.id)} className="tap inline-flex min-h-[32px] items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 text-[12.5px] font-semibold text-neutral-700 hover:border-teal-brand">
                      <Icon name="plus" size={13} />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-baseline justify-end gap-6 pt-1">
                <span className="text-xs text-neutral-600">
                  {lines.length} {lines.length === 1 ? "line" : "lines"}
                </span>
                {kind.prices ? (
                  <strong className="num font-heading text-[20px] font-extrabold text-ink-heading">GHS {amount(total)}</strong>
                ) : (
                  <strong className="num font-heading text-[20px] font-extrabold text-ink-heading">
                    {lines.reduce((s, l) => s + l.quantity, 0)} items
                  </strong>
                )}
              </div>
            </Card>

            {/* Dates, note, getting paid */}
            <div className={`grid grid-cols-1 gap-3.5 ${["invoice", "quotation", "proforma"].includes(type) ? "sm:grid-cols-2" : ""}`}>
              <Card>
                <H2>Dates and terms</H2>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <Label>{kind.d1}</Label>
                    <span className="flex min-h-[44px] items-center rounded-control border border-neutral-200 bg-neutral-50 px-3 text-[13.5px] text-ink">{longDay(todayISO())}</span>
                  </div>
                  {kind.d2 && (
                    <label className="flex flex-col gap-1.5">
                      <Label>{kind.d2}</Label>
                      <input
                        type="date"
                        min={todayISO()}
                        value={isPO ? deliverBy : due}
                        onChange={(e) => (isPO ? setDeliverBy(e.target.value) : setDue(e.target.value))}
                        className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink focus:border-teal focus:outline-none sm:text-[13.5px]"
                      />
                    </label>
                  )}
                  {type === "delivery_note" && start && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Against</Label>
                      <span className="flex min-h-[44px] items-center truncate rounded-control border border-neutral-200 bg-neutral-50 px-3 text-[13.5px] text-ink">{start.option.label}</span>
                    </div>
                  )}
                </div>
                <label className="flex flex-col gap-1.5">
                  <Label>Note on the document</Label>
                  <textarea
                    rows={2}
                    maxLength={400}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={kind.noteHint}
                    className="w-full resize-y rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                  />
                </label>
              </Card>
              {["invoice", "quotation", "proforma"].includes(type) && (
                <Card>
                  <H2>Getting paid</H2>
                  <Toggle on={false} title="Pay link and QR" detail="Comes when online payments switch on. Until then they pay you by MoMo or cash and you record it." />
                  <Toggle on={false} title="Ask for a 30% deposit" detail="Comes with online payments too." />
                  {type === "invoice" ? (
                    <Toggle on title="Automatic reminders" detail="On every invoice: a reminder each week while it is overdue." />
                  ) : (
                    <Toggle on={false} title="Automatic reminders" detail="Reminders follow the invoice, not the quotation." />
                  )}
                </Card>
              )}
            </div>
          </div>

          {/* The preview and sending */}
          <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[88px]">
            <div className="flex items-center justify-between gap-2">
              <Label>Preview · what {first} receives</Label>
              <Link href="/documents#look" className="tap inline-flex items-center gap-1 text-[12.5px] font-semibold text-teal-700">
                Change the look
              </Link>
            </div>
            <div className="rounded-[20px] bg-[#e6ebea] p-3 sm:p-[18px]">
              <Preview
                kind={kind}
                accent={accent}
                business={{
                  name: data.look?.tradingName || data.businessName,
                  line: [data.look?.addressLine, data.look?.phone].filter(Boolean).join(" · "),
                }}
                party={{ name: partyName || (isPO ? "Your supplier" : "Your customer"), sub: partyPhone ? localPhone(partyPhone) : partyEmail ?? "" }}
                meta={[
                  { k: kind.d1, v: longDay(todayISO()) },
                  ...(kind.d2 ? [{ k: kind.d2, v: longDay(isPO ? deliverBy : due) }] : []),
                  ...(type === "delivery_note" && start ? [{ k: "Against", v: start.option.label }] : []),
                ]}
                lines={priced.map((l) => ({ d: l.description, sub: itemSub(l), q: l.quantity, u: parseFloat(l.unitPrice) || 0 }))}
                total={total}
                note={note}
                footer={data.look?.footerNote ?? null}
              />
            </div>

            <Card>
              {kind.sends ? (
                <>
                  <Label>Send by</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip on={wa} disabled={!partyPhone} onClick={() => setSendBy({ whatsapp: !wa, email: em })} icon={wa ? "check" : undefined}>
                      WhatsApp
                    </Chip>
                    <Chip on={em} disabled={!partyEmail} onClick={() => setSendBy({ whatsapp: wa, email: !em })} icon={em ? "check" : undefined}>
                      Email
                    </Chip>
                    <Chip on={!wa && !em} onClick={() => setSendBy({ whatsapp: false, email: false })} icon={!wa && !em ? "check" : undefined}>
                      PDF only
                    </Chip>
                  </div>
                  <span className="text-xs leading-relaxed text-neutral-600">
                    {wa || em
                      ? `Ascend sends ${first} a secure link${wa && em ? " on WhatsApp and by email" : wa ? " on WhatsApp" : " by email"}. You can share it from your own WhatsApp too.`
                      : party
                        ? "Nothing is sent. You get the PDF and a link to share yourself."
                        : "Pick who it is for and Ascend can send it to them. Without a name you get the PDF and a link."}
                  </span>
                </>
              ) : (
                <span className="text-xs leading-relaxed text-neutral-600">
                  {isPO
                    ? "You get the PDF and a link to share with the supplier from your own WhatsApp."
                    : "You get the PDF to print and sign on delivery, and a link to share."}
                </span>
              )}
              {error && (
                <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13px] font-semibold text-danger-ink">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => save(true)} disabled={busy !== null || needsStart} className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}>
                  <Icon name="send" size={16} />
                  {busy === "send" ? (kind.sends && (wa || em) ? `Sending to ${first}...` : "Making it...") : kind.sends && !(wa || em) ? `Make the ${kind.label.toLowerCase()}` : kind.cta}
                </button>
                <button type="button" onClick={() => save(false)} disabled={busy !== null || needsStart} className={`${secondaryAction} disabled:opacity-60`}>
                  {busy === "draft" ? "Saving..." : "Save draft"}
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// What the customer receives, in the Classic look the PDF uses. The other
// looks arrive with "How documents look" (R2).
function Preview({
  kind,
  accent,
  business,
  party,
  meta,
  lines,
  total,
  note,
  footer,
}: {
  kind: Kind;
  accent: string;
  business: { name: string; line: string };
  party: { name: string; sub: string };
  meta: Array<{ k: string; v: string }>;
  lines: Array<{ d: string; sub: string; q: number; u: number }>;
  total: number;
  note: string;
  footer: string | null;
}) {
  const initials = business.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className="flex flex-col gap-4 rounded-[6px] bg-white px-5 py-6 text-[12px] text-ink shadow-[0_1px_3px_rgba(0,95,87,0.12)] sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 items-start gap-3">
          {/* @contrast-ignore the brand colour the business chose, white initials on it */}
          <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] font-heading text-[13px] font-extrabold text-white" style={{ background: accent }}>
            {initials || "A"}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="truncate font-heading text-[14px]">{business.name}</strong>
            {business.line && <span className="text-[11px] text-neutral-600">{business.line}</span>}
          </span>
        </span>
        <span className="flex flex-none flex-col items-end gap-0.5">
          <span className="font-heading text-[15px] font-extrabold tracking-[0.05em] sm:text-[18px]" style={{ color: accent }}>
            {kind.title}
          </span>
          <span className="text-[11px] text-neutral-600">Numbered when sent</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-[10px] bg-neutral-50 px-3.5 py-3 sm:grid-cols-3">
        <span className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1">
          <span className="text-[10.5px] text-neutral-600">{kind.party}</span>
          <strong className="truncate">{party.name}</strong>
          {party.sub && <span className="truncate text-[11px] text-neutral-600">{party.sub}</span>}
        </span>
        {meta.map((m) => (
          <span key={m.k} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10.5px] text-neutral-600">{m.k}</span>
            <strong className="truncate">{m.v}</strong>
          </span>
        ))}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10.5px] text-neutral-600">
            <th className="pb-1.5 text-left font-semibold" style={{ borderBottom: `1.5px solid ${accent}` }}>{kind.prices ? "DESCRIPTION" : "ITEM"}</th>
            <th className="pb-1.5 text-center font-semibold" style={{ borderBottom: `1.5px solid ${accent}` }}>{kind.prices ? "QTY" : "ORDERED"}</th>
            <th className="pb-1.5 text-right font-semibold" style={{ borderBottom: `1.5px solid ${accent}` }}>{kind.prices ? "AMOUNT" : "DELIVERED"}</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-4 text-center text-[11.5px] text-neutral-500">Items you add show here</td>
            </tr>
          ) : (
            lines.map((l, i) => (
              <tr key={i}>
                <td className="border-b border-[#EEF0F2] py-2 pr-2">
                  <span className="flex flex-col gap-px">
                    <span className="font-semibold">{l.d}</span>
                    {kind.prices && <span className="num text-[10.5px] text-neutral-600">{amount(l.u)} each</span>}
                  </span>
                </td>
                <td className="num border-b border-[#EEF0F2] py-2 text-center">{l.q}</td>
                <td className="num border-b border-[#EEF0F2] py-2 text-right">{kind.prices ? amount(l.q * l.u) : l.q}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          {kind.sign && (
            <div className="grid grid-cols-2 gap-4 pt-4">
              {kind.sign.map((s) => (
                <span key={s} className="flex flex-col gap-1">
                  <span className="border-t border-neutral-400" />
                  <span className="text-[10.5px] text-neutral-600">{s}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {kind.prices && (
          <div className="flex min-w-[150px] flex-col gap-1">
            <span className="flex justify-between gap-3 text-neutral-600">
              <span>Subtotal</span>
              <span className="num">{amount(total)}</span>
            </span>
            <span className="num flex justify-between gap-3 pt-1.5 font-heading text-[14px] font-extrabold" style={{ borderTop: `1.5px solid ${accent}` }}>
              <span>{kind.title === "RECEIPT" ? "Total paid" : "Total"}</span>
              <span>GHS {amount(total)}</span>
            </span>
          </div>
        )}
      </div>

      {(note.trim() || footer) && (
        <span className="border-t border-[#EEF0F2] pt-2 text-[10.5px] leading-normal text-neutral-600">
          {[note.trim(), footer].filter(Boolean).join(" ")}
        </span>
      )}
    </div>
  );
}

// A credit note corrects an invoice that went out, so it starts there.
function CreditNoteStart({ invoices }: { invoices: StartOption[] }) {
  return (
    <Card>
      <H2>A credit note starts from the invoice it corrects</H2>
      <span className="text-[13px] leading-relaxed text-neutral-600">
        Open the invoice and tap Give money back. The credit note keeps the reason, reduces what they owe, and both documents keep their history.
      </span>
      {invoices.length === 0 ? (
        <p className="text-[13px] text-neutral-600">No invoice has been sent yet, so there is nothing to credit.</p>
      ) : (
        <div className="flex flex-col">
          {invoices.slice(0, 12).map((o) => (
            <Link key={o.id} href={`/documents/${o.id}`} className="tap flex min-h-[48px] items-center gap-3 border-t border-neutral-100 px-1 py-2 hover:bg-teal-50">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="mono truncate text-[13px] font-semibold text-ink">{o.label}</span>
                <span className="truncate text-xs text-neutral-600">{o.sub}</span>
              </span>
              <span className="num flex-none text-[13.5px] font-bold text-ink">GHS {amount(o.total)}</span>
              <Icon name="chev" size={16} />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-panel border border-line-brand bg-white p-4 sm:p-[18px]">{children}</section>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-[16px] font-bold text-ink-heading">{children}</h2>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">{children}</span>;
}
function Chip({
  on,
  onClick,
  icon,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon?: Parameters<typeof Icon>[0]["name"];
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`tap inline-flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold disabled:opacity-50 ${
        on ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
      }`}
    >
      {icon && <Icon name={icon} size={15} />}
      <span className="truncate">{children}</span>
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode?: "tel" | "email";
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-neutral-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
      />
    </label>
  );
}
function Toggle({ on, title, detail }: { on: boolean; title: string; detail: string }) {
  return (
    <div className={`flex items-start gap-3 ${on ? "" : "opacity-70"}`}>
      <span aria-hidden className={`mt-0.5 flex h-[22px] w-[38px] flex-none items-center rounded-full p-0.5 ${on ? "justify-end bg-teal" : "justify-start bg-neutral-300"}`}>
        <span className="h-[18px] w-[18px] rounded-full bg-white shadow-sm" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-ink">
          {title}
          <span className="sr-only">{on ? ", on" : ", off"}</span>
        </span>
        <span className="text-xs leading-relaxed text-neutral-600">{detail}</span>
      </span>
    </div>
  );
}
