import { PageShell, Panel } from "./Page";

// What a screen looks like in the moment between the tap and the data.
//
// Before this the app had nothing here. Next renders a server page only
// once its queries have returned, so tapping a link left the merchant on
// the previous screen with no sign anything had happened, for as long as
// the round trip took. On a Ghanaian mobile connection that reads as a
// dead tap, and the honest response to a dead tap is to tap again.
//
// These stand in for the page that is coming, in its real shape and its
// real measure, so the layout does not jump when the data lands. They are
// deliberately not a spinner: a spinner says something is happening, a
// skeleton says what is happening and where it will be.

// The shimmer is defined once, in globals.css, so every skeleton on every
// screen moves at the same speed. Motion here is doing a job, which is to
// distinguish a screen that is loading from a screen that is empty.
const BAR = "animate-pulse rounded-[6px] bg-[#E7EDF3]";

export function SkeletonBar({
  w = "w-32",
  h = "h-4",
  className = "",
}: {
  w?: string;
  h?: string;
  className?: string;
}) {
  return <span className={`block ${BAR} ${w} ${h} ${className}`} aria-hidden />;
}

// The title block, which is the part a merchant reads first and so the
// part worth holding space for most precisely.
export function SkeletonHeader({ intro = true }: { intro?: boolean }) {
  return (
    <div className="mb-[18px] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        <SkeletonBar w="w-44" h="h-7" />
        {intro && <SkeletonBar w="w-64" h="h-4" className="mt-2.5" />}
      </div>
      <SkeletonBar w="w-36" h="h-11" className="rounded-control" />
    </div>
  );
}

// A list of rows on a panel, which is the shape of Products, Orders,
// Documents, Bookings and most of the merchant screens.
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <Panel>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-4 px-[22px] py-4 ${
            i === rows - 1 ? "" : "border-b border-[#EEF3F7]"
          }`}
        >
          <SkeletonBar w="w-[46px]" h="h-[46px]" className="flex-none rounded-control" />
          <div className="min-w-0 flex-1">
            <SkeletonBar w="w-1/3" h="h-4" />
            <SkeletonBar w="w-1/4" h="h-3" className="mt-2" />
          </div>
          <SkeletonBar w="w-16" h="h-4" className="hidden flex-none sm:block" />
        </div>
      ))}
    </Panel>
  );
}

// The stat strip that opens the dashboard and the bookings week.
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[18px] border border-line-soft bg-white px-5 py-4 shadow-lift"
        >
          <SkeletonBar w="w-20" h="h-3" />
          <SkeletonBar w="w-16" h="h-6" className="mt-3" />
        </div>
      ))}
    </div>
  );
}

// A grid of cards, for the browsing screens rather than the working ones.
export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-panel border border-line bg-white shadow-card"
        >
          <SkeletonBar w="w-full" h="h-auto" className="aspect-square rounded-none" />
          <div className="px-3 pb-3 pt-2.5">
            <SkeletonBar w="w-3/4" h="h-3.5" />
            <SkeletonBar w="w-1/3" h="h-3.5" className="mt-2" />
            <SkeletonBar w="w-1/2" h="h-3" className="mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// The default merchant screen: a title and a list. Most pages are this.
export function SkeletonPage({
  rows = 6,
  stats = 0,
}: {
  rows?: number;
  stats?: number;
}) {
  return (
    <PageShell>
      {/* Announced once, politely. A screen reader should hear that the
          screen is loading, not hear every placeholder bar in it. */}
      <p className="sr-only" role="status">
        Loading
      </p>
      <SkeletonHeader />
      {stats > 0 && (
        <div className="mb-4">
          <SkeletonStats count={stats} />
        </div>
      )}
      <SkeletonRows rows={rows} />
    </PageShell>
  );
}
