import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openShop } from "@/lib/shop/openShop";
import TrackForm from "@/components/shop/TrackForm";

export const dynamic = "force-dynamic";

// Track an order (round 4, S1): for a customer who has lost the link. The
// reference and the phone number open a fresh private link to that order.

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const shop = await openShop(params.slug);
  return { title: shop ? `${shop.name} · Track your order` : "Shop not found", robots: { index: false, follow: false } };
}

export default async function TrackPage({ params }: { params: { slug: string } }) {
  const shop = await openShop(params.slug);
  if (!shop) notFound();
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-16 pt-8">
        <a href={`/s/${params.slug}`} className="tap inline-flex min-h-[44px] items-center self-start text-[14px] font-semibold text-teal-dark">
          Back to {shop.name}
        </a>
        <h1 className="font-heading text-[24px] font-extrabold text-ink-heading">Track your order</h1>
        <p className="text-[14px] leading-relaxed text-neutral-600">
          Your order reference is in the WhatsApp message from {shop.name}. Put it here with the number you ordered with.
        </p>
        <TrackForm slug={params.slug} />
      </div>
    </main>
  );
}
