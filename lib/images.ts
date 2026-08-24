// Getting a phone photo down to something worth sending.
//
// A photo straight off a phone camera is three to eight megabytes. Sending
// that raw costs the merchant on upload and costs every till on sync, and
// on a Ghanaian mobile bundle that is real money for something nobody will
// ever look at closely. A product tile is a couple of hundred pixels.
//
// Downscaling happens in the browser, before anything is sent, so the cost
// is never paid in the first place.

/** Long edge of the stored image. Comfortably sharp on a tile or a
    storefront card, and small enough to sync a whole catalogue cheaply. */
const MAX_EDGE = 800;

/** WebP at this quality is visually clean for product photography and
    roughly a tenth the size of the original JPEG. */
const QUALITY = 0.82;

export interface PreparedImage {
  /** Base64 without the data URL prefix, ready to post. */
  base64: string;
  mediaType: "image/webp" | "image/jpeg";
  /** For showing the merchant what they picked, before any upload. */
  previewUrl: string;
  bytes: number;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable_image"));
    img.src = dataUrl;
  });
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // No canvas: send what we have rather than refusing the photo.
    return {
      base64: original.split(",")[1] ?? "",
      mediaType: file.type === "image/png" ? "image/jpeg" : "image/jpeg",
      previewUrl: original,
      bytes: Math.round(((original.length - 22) * 3) / 4),
    };
  }

  // A white ground, because a transparent PNG re-encoded to WebP over
  // nothing turns black on a dark till.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let dataUrl = canvas.toDataURL("image/webp", QUALITY);
  let mediaType: PreparedImage["mediaType"] = "image/webp";

  // Older Safari silently hands back a PNG when asked for WebP, which is
  // larger than the original. JPEG is the honest fallback.
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    mediaType = "image/jpeg";
  }

  const base64 = dataUrl.split(",")[1] ?? "";
  return {
    base64,
    mediaType,
    previewUrl: dataUrl,
    bytes: Math.round((base64.length * 3) / 4),
  };
}
