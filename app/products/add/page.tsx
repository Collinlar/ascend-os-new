import AddProducts from "@/components/catalogue/AddProducts";
import { currentWorkspace } from "@/lib/nav/workspace";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Adding what you sell. The only door into the catalogue, whichever way the
// merchant started, so it asks the workspace what they actually have rather
// than assuming a Shop.

export default async function AddProductsPage() {
  const workspace = await currentWorkspace().catch(() => null);

  // Without a business there is nothing to add products to. Saying so beats
  // rendering a form whose every save fails.
  if (!workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-ink">
            Verify your WhatsApp number to add what you sell.
          </h1>
          <Link
            href="/onboarding"
            className="tap mt-5 inline-flex items-center bg-teal px-5 py-3 font-medium text-white"
          >
            Continue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <AddProducts
      businessId={workspace.businessId}
      sellsOnline={workspace.capabilities.has("shop.storefront")}
    />
  );
}
