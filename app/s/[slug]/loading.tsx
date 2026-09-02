import { SkeletonBar, SkeletonCards } from "@/components/shell/Skeleton";

// A storefront is usually reached from a forwarded WhatsApp link, which
// means the first thing a customer sees is this. It sits on white with the
// shop's identity strip, not on the merchant canvas, so it holds its own
// shape rather than the shared one.
//
// The shop's name is the one thing worth waiting for, so its bar sits
// where the name will be instead of being guessed at.
export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-11">
          <SkeletonBar w="w-40" h="h-5" />
          <SkeletonBar w="w-20" h="h-8" className="rounded-chip" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-11">
        <p className="sr-only" role="status">
          Opening the shop
        </p>
        <SkeletonCards count={6} />
      </div>
    </div>
  );
}
