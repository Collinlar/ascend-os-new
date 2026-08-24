import { redirect } from "next/navigation";

// Product entry moved to /products/add, because it is the only way into the
// catalogue for every merchant and not a Shop-only step. Kept so links,
// bookmarks and anything printed on a card still land somewhere useful.
export default function ShopSetupMoved() {
  redirect("/products/add");
}
