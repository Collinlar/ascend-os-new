import { SkeletonBar, SkeletonCards } from "@/components/shell/Skeleton";

// Discover is a customer screen on white, so it holds its own shape: the
// header with the search, the question, the shelves, then the shops. The
// question is real text; it is the same on every load.
export default function Loading() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-[1280px] items-center gap-5 px-4 py-3.5 sm:px-8">
          <SkeletonBar w="w-40" h="h-6" />
          <SkeletonBar w="w-full max-w-[640px] flex-1" h="h-12" className="rounded-full" />
        </div>
      </header>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-7 sm:px-8">
        <h1 className="font-heading text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-heading">
          What do you need near you today?
        </h1>
        <p className="sr-only" role="status">
          Finding shops near you
        </p>
        <div className="mt-4 flex gap-2 overflow-hidden">
          {["w-24", "w-28", "w-20", "w-32", "w-24"].map((w) => (
            <SkeletonBar key={w} w={w} h="h-10" className="flex-none rounded-full" />
          ))}
        </div>
        <div className="mt-10">
          <SkeletonCards count={4} />
        </div>
      </div>
    </main>
  );
}
