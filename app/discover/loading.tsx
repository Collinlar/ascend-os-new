import { SkeletonBar, SkeletonCards } from "@/components/shell/Skeleton";

// Discover is a customer screen on white, not a merchant screen on canvas,
// so it holds its own shape rather than the shared one: the title, the
// search row, the category rail and then the grid.
//
// The eyebrow and the heading are real text rather than placeholder bars.
// They are the same on every load, so there is no reason to make somebody
// wait to read them.
export default function Loading() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-5 sm:px-8">
        <p className="text-[11px] font-bold tracking-[0.04em] text-ink-muted">
          DISCOVER
        </p>
        <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">
          Made near you
        </h1>
        <p className="sr-only" role="status">
          Finding shops near you
        </p>

        <div className="mt-3.5 flex gap-2">
          <SkeletonBar w="w-full flex-1" h="h-11" className="rounded-[14px]" />
          <SkeletonBar w="w-24 sm:w-32" h="h-11" className="flex-none rounded-[14px]" />
          <SkeletonBar w="w-[92px]" h="h-11" className="flex-none rounded-[14px]" />
        </div>

        <div className="mt-3.5 flex gap-2 overflow-hidden">
          {["w-24", "w-28", "w-20", "w-32", "w-24"].map((w) => (
            <SkeletonBar key={w} w={w} h="h-9" className="flex-none rounded-chip" />
          ))}
        </div>

        <div className="mt-5">
          <SkeletonCards count={8} />
        </div>
      </div>
    </main>
  );
}
