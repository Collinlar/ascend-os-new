// What the New document page needs (round 2, R1): who it can be for, what
// the business sells, what it is often asked for, and the recent sales,
// bookings, Shop orders and documents a new one can start from, each with
// its customer and lines so picking one fills the form in.

import { supabaseServer } from "@/lib/supabase";
import { liveLook, lookTemplate } from "@/lib/documents/build-pdf";
import type { PreviewLook } from "@/components/documents/DocumentPreview";

export interface PartyOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** "6 visits · GHS 2,140 spent · nothing owed". */
  sub: string;
}

export interface CatalogueChoice {
  id: string;
  name: string;
  kind: string;
  basePrice: number | null;
  /** Stock left, for items that track it. */
  left: number | null;
}

export interface StartLine {
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface StartOption {
  id: string;
  /** "Sale R-0042", "Order 1A1C7682", "INV-2026-0012". */
  label: string;
  /** Who and when: "Efua Asamoah · 24 Nov". */
  sub: string;
  total: number;
  customerId: string | null;
  customerName: string | null;
  lines: StartLine[];
  /** Documents only: the kind it is, for the copy list. */
  docType?: string;
}

export interface NewDocumentData {
  businessId: string;
  businessName: string;
  /** The saved look, for the preview (Modules R2). */
  look: PreviewLook;
  customers: PartyOption[];
  suppliers: Array<{ id: string; name: string; phone: string | null; sub: string }>;
  catalogue: CatalogueChoice[];
  /** Item ids this business puts on documents and sales most. */
  often: string[];
  starts: {
    sale: StartOption[];
    shop_order: StartOption[];
    service_booking: StartOption[];
    /** Issued invoices: delivery notes and credit notes start from one. */
    invoice: StartOption[];
    /** Any past document, to copy. */
    copy: StartOption[];
  };
}

const money = (n: number) => `GHS ${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short" });
const n = (v: unknown) => Number(v ?? 0) || 0;

type Row = Record<string, unknown>;
const nameOf = (r: Row, key = "customer") =>
  ((r[key] as { display_name?: string; name?: string } | null)?.display_name ??
    (r[key] as { name?: string } | null)?.name ??
    null) as string | null;

export async function loadNewDocument(businessId: string): Promise<NewDocumentData> {
  const db = supabaseServer();
  const since = new Date(Date.now() - 90 * 864e5).toISOString();

  const [biz, look, people, suppliers, items, stock, sales, orders, bookings, docs, saleLines] = await Promise.all([
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
    liveLook(businessId),
    db.rpc("business_customers", { p_business: businessId, p_query: null }),
    db
      .from("supplier")
      .select("id, name, phone_e164, address, payment_terms")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("name")
      .limit(200),
    db
      .from("catalogue_item")
      .select("id, name, kind, base_price, track_stock")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("name")
      .limit(400),
    db.from("stock_balance").select("item_id, quantity_on_hand").eq("business_id", businessId).limit(3000),
    db
      .from("sale")
      .select("id, receipt_number, total, occurred_at, customer_id, customer:customer_id(display_name), sale_line(item_id, description, quantity, unit_price)")
      .eq("business_id", businessId)
      .eq("status", "completed")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(20),
    db
      .from("shop_order")
      .select("id, total, placed_at, status, customer_id, customer:customer_id(display_name), shop_order_line(item_id, description, quantity, unit_price)")
      .eq("business_id", businessId)
      .neq("status", "cancelled")
      .order("placed_at", { ascending: false })
      .limit(20),
    db
      .from("service_booking")
      .select("id, price_quoted, scheduled_start, created_at, status, customer_id, customer:customer_id(display_name), item:item_id(id, name, base_price)")
      .eq("business_id", businessId)
      .not("status", "in", "(cancelled,no_show)")
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("document")
      .select("id, type, status, number, total, lines, created_at, customer_id, customer:customer_id(display_name), supplier:supplier_id(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("sale_line")
      .select("item_id, quantity, sale!inner(business_id, occurred_at)")
      .eq("sale.business_id", businessId)
      .gte("sale.occurred_at", since)
      .limit(600),
  ]);

  const left = new Map<string, number>();
  for (const s of (stock.data ?? []) as Row[]) {
    left.set(s.item_id as string, (left.get(s.item_id as string) ?? 0) + n(s.quantity_on_hand));
  }

  const catalogue: CatalogueChoice[] = ((items.data ?? []) as Row[]).map((i) => ({
    id: i.id as string,
    name: i.name as string,
    kind: (i.kind as string) ?? "product",
    basePrice: i.base_price === null ? null : n(i.base_price),
    left: i.track_stock ? Math.max(0, Math.floor(left.get(i.id as string) ?? 0)) : null,
  }));
  const known = new Set(catalogue.map((c) => c.id));

  // Often added: what goes on documents and across the till most.
  const counts = new Map<string, number>();
  const bump = (id: unknown, by = 1) => {
    if (typeof id === "string" && known.has(id)) counts.set(id, (counts.get(id) ?? 0) + by);
  };
  for (const d of (docs.data ?? []) as Row[]) {
    for (const l of ((d.lines ?? []) as Row[])) bump(l.item_id, 2);
  }
  for (const l of (saleLines.data ?? []) as Row[]) bump(l.item_id);
  const often = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);

  const customers: PartyOption[] = ((people.data ?? []) as Row[]).map((c) => {
    const visits = n(c.orders) + n(c.sales) + n(c.bookings);
    const owed = n(c.owed);
    return {
      id: c.id as string,
      name: c.display_name as string,
      phone: (c.phone_e164 as string) ?? null,
      email: (c.email as string) ?? null,
      sub: [
        visits > 0 ? `${visits} visit${visits === 1 ? "" : "s"}` : "New customer",
        n(c.spent) > 0 ? `${money(n(c.spent))} spent` : null,
        owed > 0.005 ? `owes ${money(owed)}` : "nothing owed",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const lineOf = (l: Row): StartLine => ({
    itemId: typeof l.item_id === "string" && known.has(l.item_id) ? l.item_id : null,
    description: (l.description as string) ?? "",
    quantity: n(l.quantity) || 1,
    unitPrice: n(l.unit_price),
  });

  const sale: StartOption[] = ((sales.data ?? []) as Row[]).map((s) => ({
    id: s.id as string,
    label: `Sale ${s.receipt_number as string}`,
    sub: [nameOf(s) ?? "Walk-in customer", day(s.occurred_at as string)].join(" · "),
    total: n(s.total),
    customerId: (s.customer_id as string) ?? null,
    customerName: nameOf(s),
    lines: ((s.sale_line ?? []) as Row[]).map(lineOf),
  }));

  const shop_order: StartOption[] = ((orders.data ?? []) as Row[]).map((o) => ({
    id: o.id as string,
    label: `Order ${String(o.id).slice(0, 8).toUpperCase()}`,
    sub: [nameOf(o) ?? "No name given", day(o.placed_at as string)].join(" · "),
    total: n(o.total),
    customerId: (o.customer_id as string) ?? null,
    customerName: nameOf(o),
    lines: ((o.shop_order_line ?? []) as Row[]).map(lineOf),
  }));

  const service_booking: StartOption[] = ((bookings.data ?? []) as Row[]).map((b) => {
    const item = b.item as { id?: string; name?: string; base_price?: number | null } | null;
    const price = b.price_quoted !== null && b.price_quoted !== undefined ? n(b.price_quoted) : n(item?.base_price);
    return {
      id: b.id as string,
      label: item?.name ?? "Booking",
      sub: [nameOf(b) ?? "No name given", day((b.scheduled_start as string) ?? (b.created_at as string))].join(" · "),
      total: price,
      customerId: (b.customer_id as string) ?? null,
      customerName: nameOf(b),
      lines: [
        {
          itemId: item?.id && known.has(item.id) ? item.id : null,
          description: item?.name ?? "Booked service",
          quantity: 1,
          unitPrice: price,
        },
      ],
    };
  });

  const docOption = (d: Row): StartOption => ({
    id: d.id as string,
    label: (d.number as string) ?? "Draft",
    sub: [nameOf(d) ?? nameOf(d, "supplier") ?? "No name given", day(d.created_at as string)].join(" · "),
    total: n(d.total),
    customerId: (d.customer_id as string) ?? null,
    customerName: nameOf(d),
    docType: d.type as string,
    lines: ((d.lines ?? []) as Row[]).map(lineOf),
  });
  const allDocs = (docs.data ?? []) as Row[];
  const invoice = allDocs.filter((d) => d.type === "invoice" && d.number).map(docOption);
  const copy = allDocs.filter((d) => ((d.lines ?? []) as Row[]).length > 0).slice(0, 30).map(docOption);

  return {
    businessId,
    businessName: (biz.data?.name as string) ?? "Your business",
    look: {
      template: lookTemplate(look?.template),
      accent: (look?.accent_colour as string) ?? null,
      logoUrl: (look?.logo_url as string) ?? null,
      name: (look?.trading_name as string) || ((biz.data?.name as string) ?? "Your business"),
      address: (look?.address_line as string) ?? "",
      phone: (look?.phone as string) ?? "",
      email: (look?.email as string) ?? "",
      tin: (look?.tin as string) ?? "",
      footer: (look?.footer_note as string) ?? "",
      signatures: look?.signature_areas === false ? false : true,
    },
    customers,
    suppliers: ((suppliers.data ?? []) as Row[]).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      phone: (s.phone_e164 as string) ?? null,
      sub: ["Supplier", s.address as string | null, s.payment_terms ? `pays ${s.payment_terms}` : null].filter(Boolean).join(" · "),
    })),
    catalogue,
    often,
    starts: { sale, shop_order, service_booking, invoice, copy },
  };
}
