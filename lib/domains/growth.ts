// What a business could take on next, and what it already has that would
// come with it.
//
// The point of one catalogue, one customer record and one stock ledger is
// that growing is not starting again. That is easy to say in architecture
// and invisible in a product, so it is said here in counts a merchant can
// check: your seven products and three customers come too.

import { supabaseServer } from "@/lib/supabase";
import type { ProductSetKey, UUID } from "./types";

export interface GrowthOption {
  key: ProductSetKey;
  name: string;
  /** What this is for, in the merchant's words rather than the platform's. */
  pitch: string;
  /** Who it suits, short enough to read as a label rather than a sentence. */
  suits: string;
  /** What they already have that carries over, phrased for reading. */
  carriesOver: string[];
  /** Its own front door, so taking it on lands somewhere that is it. */
  home: string;
  held: boolean;
}

interface Carried {
  products: number;
  customers: number;
  hasStock: boolean;
}

async function whatTheyHave(businessId: UUID): Promise<Carried> {
  const db = supabaseServer();
  const [products, customers, stock] = await Promise.all([
    db
      .from("catalogue_item")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true),
    db
      .from("customer")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    db
      .from("stock_movement")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);
  return {
    products: products.count ?? 0,
    customers: customers.count ?? 0,
    hasStock: (stock.count ?? 0) > 0,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export async function growthOptions(
  businessId: UUID,
  productSets: ProductSetKey[]
): Promise<GrowthOption[]> {
  const have = await whatTheyHave(businessId).catch(
    (): Carried => ({ products: 0, customers: 0, hasStock: false })
  );
  const held = new Set(productSets);

  const products = have.products
    ? `${plural(have.products, "product", "products")} you already sell`
    : null;
  const customers = have.customers
    ? `${plural(have.customers, "customer", "customers")} you already know`
    : null;
  const stock = have.hasStock ? "the stock counts you already keep" : null;

  const options: GrowthOption[] = [
    {
      key: "shop",
      name: "Ascend Shop",
      pitch: "A page customers order from, that you send on WhatsApp.",
      suits: "For customers who order ahead",
      carriesOver: [products, customers, stock].filter((x): x is string => Boolean(x)),
      home: "/shop",
      held: held.has("shop"),
    },
    {
      key: "pos",
      name: "Ascend POS",
      pitch: "Sell at a counter, print receipts, watch the drawer.",
      suits: "For customers who walk in",
      carriesOver: [products, customers].filter((x): x is string => Boolean(x)),
      home: "/devices",
      held: held.has("pos"),
    },
    {
      key: "services",
      name: "Ascend Services",
      pitch: "Take bookings and deposits against your time.",
      suits: "For customers who book you",
      carriesOver: [customers].filter((x): x is string => Boolean(x)),
      home: "/bookings",
      held: held.has("services"),
    },
    {
      key: "documents",
      name: "Ascend Documents",
      pitch: "Quotes and invoices, and following the money owed to you.",
      suits: "For customers you bill",
      carriesOver: [customers, products].filter((x): x is string => Boolean(x)),
      home: "/documents",
      held: held.has("documents"),
    },
  ];

  // What they do not have yet comes first: this room exists for those.
  return options.sort((a, b) => Number(a.held) - Number(b.held));
}
