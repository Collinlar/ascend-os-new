import { notFound } from "next/navigation";
import { openShop } from "@/lib/shop/openShop";

// A layout runs before its own segment's loading screen streams, so a link
// to a shop that does not exist answers 404 here, not 200 with a "could not
// be found" page that search engines and WhatsApp previews treat as real.
export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  if (!(await openShop(params.slug))) notFound();
  return children;
}
