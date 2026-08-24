// Product photos on a till with no network.
//
// The catalogue carries a URL, which is right for sync cost: a till pulling
// two hundred products should not be pulling two hundred pictures inside
// the same payload. But a URL is useless in a shop whose network has gone,
// which is most shops, some of the time, which is the whole reason this
// terminal exists.
//
// So the bytes are fetched once, in the background, after the catalogue has
// landed and the cashier is already able to sell. Nothing here blocks a
// sale, and a photo that never arrives costs nothing: the tile falls back
// to its monogram, which was always the design.

import { getAll, put, remove, STORE, type LocalItem } from "./db";

interface CachedImage {
  url: string;
  blob: Blob;
  bytes: number;
  cachedAt: string;
}

// Downscaled photos run 30 to 80KB, so this is room for well over a
// thousand products. The ceiling exists because a till shares its storage
// with queued sales, and a sale that cannot be written because pictures
// filled the disk would be an appalling trade.
const MAX_CACHE_BYTES = 40 * 1024 * 1024;

// A handful at a time. Enough to fill a shelf quickly on a decent
// connection, few enough not to saturate a poor one while the merchant is
// trying to sell over the top of it.
const CONCURRENCY = 3;

export async function cachedImage(url: string): Promise<Blob | undefined> {
  try {
    const rows = await getAll<CachedImage>(STORE.images);
    return rows.find((r) => r.url === url)?.blob;
  } catch {
    return undefined;
  }
}

export interface ImageSyncResult {
  fetched: number;
  pruned: number;
  failed: number;
}

/**
 * Brings the cache in line with the catalogue: fetches photos it does not
 * have, and drops photos for products that are gone.
 */
export async function syncCatalogueImages(
  items: LocalItem[]
): Promise<ImageSyncResult> {
  const result: ImageSyncResult = { fetched: 0, pruned: 0, failed: 0 };
  if (typeof navigator === "undefined") return result;

  let existing: CachedImage[] = [];
  try {
    existing = await getAll<CachedImage>(STORE.images);
  } catch {
    return result;
  }

  const wanted = new Set(
    items.map((i) => i.photoUrl).filter((u): u is string => Boolean(u))
  );

  // Drop first, so a catalogue that swapped its photos does not have to fit
  // both sets at once.
  for (const row of existing) {
    if (!wanted.has(row.url)) {
      await remove(STORE.images, row.url).catch(() => {});
      result.pruned += 1;
    }
  }

  let bytesHeld = existing
    .filter((r) => wanted.has(r.url))
    .reduce((n, r) => n + r.bytes, 0);

  const have = new Set(existing.map((r) => r.url));
  const missing = Array.from(wanted).filter((u) => !have.has(u));
  if (missing.length === 0 || !navigator.onLine) return result;

  const queue = [...missing];
  async function worker() {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      if (bytesHeld >= MAX_CACHE_BYTES) return;
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) {
          result.failed += 1;
          continue;
        }
        const blob = await response.blob();
        // A photo bigger than the whole budget is not a product photo.
        if (blob.size > MAX_CACHE_BYTES) {
          result.failed += 1;
          continue;
        }
        await put(STORE.images, {
          url,
          blob,
          bytes: blob.size,
          cachedAt: new Date().toISOString(),
        } satisfies CachedImage);
        bytesHeld += blob.size;
        result.fetched += 1;
      } catch {
        // Offline mid-run, or the object is gone. Neither is worth
        // interrupting a shift over.
        result.failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)
  );
  return result;
}

/** What the cache is costing this till, for the storage screen. */
export async function cachedImageBytes(): Promise<number> {
  try {
    const rows = await getAll<CachedImage>(STORE.images);
    return rows.reduce((n, r) => n + r.bytes, 0);
  } catch {
    return 0;
  }
}
