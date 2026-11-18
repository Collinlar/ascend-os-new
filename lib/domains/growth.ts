// What a business could take on next, and what it already has that would
// come with it.
//
// The point of one catalogue, one customer record and one stock ledger is
// that growing is not starting again. That is easy to say in architecture
// and invisible in a product, so it is said here in counts a merchant can
// check: your seven products and three customers come too.

import { supabaseServer } from "@/lib/supabase";
import type { ProductSetKey, UUID } from "./types";

/** One count from the business's own records, shown as a figure. */
export interface Carried {
  n: number;
  label: string;
}

export interface GrowthOption {
  key: ProductSetKey;
  name: string;
  /** The headline: what changes for the business, in its own words. */
  title: string;
  body: string;
  /** What they already have that carries over. Zeros are left out. */
  carriesOver: Carried[];
  /** What switching it on gives them. Only what Ascend does today. */
  includes: string[];
  /** One line under the button, about what stays as it is. */
  fine: string;
  /** Its own front door, so taking it on lands somewhere that is it. */
  home: string;
  held: boolean;
}

interface Have {
  products: number;
  withPhotos: number;
  tracked: number;
  customers: number;
  reachable: number;
}

async function whatTheyHave(businessId: UUID): Promise<Have> {
  const db = supabaseServer();
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const items = () =>
    db.from("catalogue_item").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("active", true);
  const people = () => db.from("customer").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  const [products, withPhotos, tracked, customers, reachable] = await Promise.all([
    count(items()),
    count(items().not("photo_url", "is", null)),
    count(items().eq("track_stock", true)),
    count(people()),
    count(people().not("phone_e164", "is", null)),
  ]);
  return { products, withPhotos, tracked, customers, reachable };
}

function carried(...figures: [number, string, string][]): Carried[] {
  return figures.filter(([n]) => n > 0).map(([n, one, many]) => ({ n, label: n === 1 ? one : many }));
}

export async function growthOptions(businessId: UUID, productSets: ProductSetKey[]): Promise<GrowthOption[]> {
  const h = await whatTheyHave(businessId).catch(
    (): Have => ({ products: 0, withPhotos: 0, tracked: 0, customers: 0, reachable: 0 })
  );
  const held = new Set(productSets);

  const options: GrowthOption[] = [
    {
      key: "shop",
      name: "Ascend Shop",
      title: "Turn the products you already have into an online Shop",
      body: "No second catalogue. Your products go online with one link to share on WhatsApp and Instagram.",
      carriesOver: carried(
        [h.products, "product ready to go online", "products ready to go online"],
        [h.withPhotos, "already has a photo", "already have photos"],
        [h.customers, "customer to tell", "customers to tell"]
      ),
      includes: [
        "A Shop page with its own link",
        "Orders arrive in Orders, for pickup or delivery",
        "The same stock counts as your till",
      ],
      fine: "Your products, prices and stock stay as they are.",
      home: "/shop",
      held: held.has("shop"),
    },
    {
      key: "pos",
      name: "Ascend POS",
      title: "Sell at the counter with the products you already have",
      body: "Ring up sales on a phone or a till, print receipts, and count the drawer at the end of the day.",
      carriesOver: carried(
        [h.products, "product ready to ring up", "products ready to ring up"],
        [h.tracked, "tracked for stock", "tracked for stock"],
        [h.customers, "customer you already know", "customers you already know"]
      ),
      includes: [
        "Sell from a phone or a dedicated till",
        "Staff sign in with their own PIN",
        "Keeps selling when the network drops, and sends the sales later",
      ],
      fine: "Your products and prices are the same on the till and everywhere else.",
      home: "/devices",
      held: held.has("pos"),
    },
    {
      key: "services",
      name: "Ascend Services",
      title: "Take bookings against your time",
      body: "Customers book a slot from your link, and you see the day ahead before it starts.",
      carriesOver: carried(
        [h.customers, "customer you already know", "customers you already know"],
        [h.reachable, "reachable on WhatsApp", "reachable on WhatsApp"]
      ),
      includes: [
        "A booking page with its own link",
        "Your services and their prices in one list",
        "The hours you are open for bookings, set by you",
      ],
      fine: "Returning clients are already known when they book.",
      home: "/services",
      held: held.has("services"),
    },
    {
      key: "documents",
      name: "Ascend Documents",
      title: "Invoices, receipts, and the money owed to you",
      body: "Bill a customer, send them the invoice as a link, and see who has not paid yet.",
      carriesOver: carried(
        [h.customers, "customer ready to bill", "customers ready to bill"],
        [h.products, "product with a price", "products with prices"]
      ),
      includes: [
        "Invoices and receipts with your business name",
        "Customers open them from a link, no app needed",
        "Who owes you, and for how long",
      ],
      fine: "Your customers and products are ready to bill from the first invoice.",
      home: "/documents",
      held: held.has("documents"),
    },
  ];

  // What they do not have yet comes first: this room exists for those.
  return options.sort((a, b) => Number(a.held) - Number(b.held));
}
