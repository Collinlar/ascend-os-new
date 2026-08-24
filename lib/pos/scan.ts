// Barcode scanning (POS-003).
//
// Support is genuinely uneven on the handsets Ghanaian merchants carry:
// BarcodeDetector ships in Chrome on Android but not in Safari, and a
// tablet on a counter may have no usable rear camera at all. So capability
// is detected rather than assumed, and every failure has a way forward —
// a cashier must never be stuck holding a product they cannot ring up.

export type ScanCapability =
  | { kind: "ready" }
  | { kind: "no_detector" } // camera fine, decoding unsupported
  | { kind: "no_camera" }
  | { kind: "insecure" }; // getUserMedia needs a secure context

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

// The symbologies a shop actually meets: retail products carry EAN/UPC,
// and locally printed labels are usually Code 128.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];

function detectorCtor(): BarcodeDetectorCtor | undefined {
  return (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
}

export function scanCapability(): ScanCapability {
  if (typeof window === "undefined") return { kind: "no_camera" };
  if (!window.isSecureContext) return { kind: "insecure" };
  if (!navigator.mediaDevices?.getUserMedia) return { kind: "no_camera" };
  if (!detectorCtor()) return { kind: "no_detector" };
  return { kind: "ready" };
}

export type CameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "denied" | "unavailable" };

export async function openCamera(): Promise<CameraResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      // The rear camera is the one pointed at the product.
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    return { ok: true, stream };
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    return {
      ok: false,
      reason: name === "NotAllowedError" ? "denied" : "unavailable",
    };
  }
}

export function closeCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

// Some devices expose a torch. A shop at dusk with no lights makes an
// otherwise fine scanner useless, so it is offered when present.
export function torchSupported(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  if (!track) return false;
  const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
  return Boolean(caps?.torch);
}

export async function setTorch(
  stream: MediaStream | null,
  on: boolean
): Promise<void> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    });
  } catch {
    // Torch is a convenience; failing to toggle it must not break scanning.
  }
}

// Polls frames for a barcode. Returns a stop function so the caller can
// always end the loop, including when the component unmounts mid-scan.
export function startDetectionLoop(
  video: HTMLVideoElement,
  onFound: (code: string) => void,
  intervalMs = 350
): () => void {
  const Ctor = detectorCtor();
  if (!Ctor) return () => {};

  const detector = new Ctor({ formats: FORMATS });
  let stopped = false;
  let busy = false;

  const timer = setInterval(async () => {
    // Skip while a previous detect is still running, or the frame is not
    // yet painted — otherwise slow devices queue work they cannot finish.
    if (stopped || busy || video.readyState < 2) return;
    busy = true;
    try {
      const results = await detector.detect(video);
      const code = results[0]?.rawValue?.trim();
      if (code && !stopped) onFound(code);
    } catch {
      // A failed frame is normal: bad focus, motion blur, nothing in view.
    } finally {
      busy = false;
    }
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// Barcodes are printed with and without their leading zero, and cashiers
// type them with spaces. Compare on digits alone.
export function normaliseBarcode(code: string): string {
  return code.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function matchesBarcode(
  itemBarcode: string | null | undefined,
  scanned: string
): boolean {
  if (!itemBarcode) return false;
  const a = normaliseBarcode(itemBarcode);
  const b = normaliseBarcode(scanned);
  if (!a || !b) return false;
  if (a === b) return true;
  // EAN-13 and UPC-A differ only by a leading zero.
  return a.replace(/^0+/, "") === b.replace(/^0+/, "");
}
