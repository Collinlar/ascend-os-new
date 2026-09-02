import { SkeletonPage } from "@/components/shell/Skeleton";

// The fallback for any screen without its own. Next uses the nearest
// loading file up the tree, so this one catches everything below the root
// layout and gives every route instant feedback rather than none.
export default function Loading() {
  return <SkeletonPage rows={5} />;
}
