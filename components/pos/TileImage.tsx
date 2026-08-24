"use client";

import { useEffect, useState } from "react";
import { cachedImage } from "@/lib/pos/images";

// A product photo on a selling tile.
//
// Prefers the cached bytes, so the shelf looks the same whether or not the
// network is up. Falls back to the URL while the cache is still filling,
// and to whatever the parent renders underneath if there is no photo at
// all. Object URLs are revoked on unmount, because a grid of these mounting
// and unmounting through a shift would otherwise leak every picture it ever
// showed.

export default function TileImage({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    cachedImage(url)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        } else {
          // Not cached yet. The network copy is correct while it fills.
          setSrc(url);
        }
      })
      .catch(() => {
        if (!cancelled) setSrc(url);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={className} />
  );
}
