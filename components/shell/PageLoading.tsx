import { SkeletonPage } from "@/components/shell/Skeleton";

/**
 * The workspace skeleton. Each signed-in area re-exports this as its own
 * loading.tsx. There is deliberately no app-wide app/loading.tsx: one at the
 * root makes every page stream, so the 200 status goes out before a page can
 * say notFound(), and every missing shop or document link answered 200.
 */
export default function PageLoading() {
  return <SkeletonPage rows={5} />;
}
