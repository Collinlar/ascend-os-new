"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatGHS } from "@/lib/money";
import type { LocalItem } from "@/lib/pos/db";
import { categoryTint, monogram, tileSurface } from "@/lib/pos/tint";
import {
  closeCamera,
  matchesBarcode,
  openCamera,
  scanCapability,
  setTorch,
  startDetectionLoop,
  torchSupported,
} from "@/lib/pos/scan";

// Scanning a basket, not a product. A cashier with ten items should scan
// ten times without reopening the camera, so a found item offers "keep
// going" as the primary action and "done" as the way out.

type Phase = "scanning" | "found" | "unknown" | "manual" | "attaching";

export default function ScanSheet({
  catalogue,
  onAdd,
  onAttach,
  onClose,
}: {
  catalogue: LocalItem[];
  onAdd: (item: LocalItem) => void;
  /** Records an unknown barcode against a product the cashier picks. */
  onAttach: (itemId: string, barcode: string) => Promise<void>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoopRef = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [found, setFound] = useState<LocalItem | null>(null);
  const [unknownCode, setUnknownCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [attachQuery, setAttachQuery] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);

  const lookup = useCallback(
    (code: string) =>
      catalogue.find((item) => matchesBarcode(item.barcode, code)) ?? null,
    [catalogue]
  );

  const handleCode = useCallback(
    (code: string) => {
      const item = lookup(code);
      // Pause detection while the cashier decides, or a barcode still in
      // frame fires repeatedly.
      stopLoopRef.current?.();
      stopLoopRef.current = null;
      if (item) {
        setFound(item);
        setPhase("found");
      } else {
        setUnknownCode(code);
        setPhase("unknown");
      }
    },
    [lookup]
  );

  const beginScanning = useCallback(() => {
    setPhase("scanning");
    setFound(null);
    const video = videoRef.current;
    if (!video) return;
    stopLoopRef.current?.();
    stopLoopRef.current = startDetectionLoop(video, handleCode);
  }, [handleCode]);

  useEffect(() => {
    const capability = scanCapability();

    if (capability.kind !== "ready") {
      setPhase("manual");
      setProblem(
        capability.kind === "no_detector"
          ? "This phone cannot read barcodes with its camera. Type the number instead."
          : capability.kind === "insecure"
            ? "Scanning needs a secure connection. Type the number instead."
            : "No camera on this device. Type the number instead."
      );
      return;
    }

    let cancelled = false;
    (async () => {
      const camera = await openCamera();
      if (cancelled) {
        if (camera.ok) closeCamera(camera.stream);
        return;
      }
      if (!camera.ok) {
        setPhase("manual");
        setProblem(
          camera.reason === "denied"
            ? "The camera is blocked. Allow it in your browser, or type the number."
            : "We could not open the camera. Type the number instead."
        );
        return;
      }

      streamRef.current = camera.stream;
      setCanTorch(torchSupported(camera.stream));
      const video = videoRef.current;
      if (video) {
        video.srcObject = camera.stream;
        await video.play().catch(() => {});
        stopLoopRef.current = startDetectionLoop(video, handleCode);
      }
    })();

    return () => {
      cancelled = true;
      stopLoopRef.current?.();
      closeCamera(streamRef.current);
      streamRef.current = null;
    };
  }, [handleCode]);

  function addAndContinue() {
    if (found) {
      onAdd(found);
      setAddedCount((n) => n + 1);
    }
    beginScanning();
  }

  function addAndFinish() {
    if (found) onAdd(found);
    onClose();
  }

  function submitManual() {
    const code = manualCode.trim();
    if (!code) return;
    const item = lookup(code);
    if (item) {
      setFound(item);
      setPhase("found");
      setManualCode("");
    } else {
      setUnknownCode(code);
      setPhase("unknown");
    }
  }

  async function toggleTorch() {
    const next = !torchOn;
    setTorchOn(next);
    await setTorch(streamRef.current, next);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-bold">Scan items</span>
        <div className="flex items-center gap-3">
          {addedCount > 0 && (
            <span className="num rounded-chip bg-teal px-3 py-1 text-xs font-bold">
              {addedCount} added
            </span>
          )}
          <button onClick={onClose} className="tap px-2 text-sm font-bold text-white/70">
            Done
          </button>
        </div>
      </header>

      {/* Camera viewport */}
      {phase !== "manual" && (
        <div className="relative mx-4 overflow-hidden rounded-card bg-black/50">
          <video
            ref={videoRef}
            className="h-[46vh] w-full object-cover"
            muted
            playsInline
          />
          {phase === "scanning" && (
            <>
              <div className="pointer-events-none absolute inset-x-8 inset-y-16 rounded-panel border-2 border-teal-mint/70" />
              <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/80">
                Point at the barcode
              </p>
            </>
          )}
          {canTorch && (
            <button
              onClick={toggleTorch}
              className={`tap absolute right-3 top-3 rounded-chip px-3 text-xs font-bold ${
                torchOn ? "bg-gold text-ink" : "bg-black/50 text-white"
              }`}
            >
              {torchOn ? "Light on" : "Light"}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {problem && (
          <p className="mb-4 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-dark">
            {problem}
          </p>
        )}

        {/* A found product, confirmed before it joins the basket */}
        {phase === "found" && found && (
          <div className="animate-popin rounded-card bg-white/10 p-4">
            <div className="flex items-center gap-4">
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-panel"
                style={tileSurface(found.category)}
              >
                <span
                  className="text-xl font-extrabold"
                  style={{ color: categoryTint(found.category)[1] }}
                >
                  {monogram(found.name)}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{found.name}</p>
                <p className="num text-lg font-extrabold">{formatGHS(found.price)}</p>
                {found.trackStock && found.localStock !== undefined && (
                  <p className="num text-xs text-white/60">{found.localStock} left</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={addAndContinue}
                className="tap flex-[2] rounded-control bg-teal py-3 font-bold"
              >
                Add and scan the next
              </button>
              <button
                onClick={addAndFinish}
                className="tap rounded-control border border-white/25 px-4 text-sm font-bold"
              >
                Add and finish
              </button>
            </div>
          </div>
        )}

        {/* An unknown barcode is the best moment there is to record one: the
            product is in the cashier's hand and the code is already read. */}
        {phase === "unknown" && (
          <div className="rounded-card bg-white/10 p-4">
            <p className="font-bold">This barcode is not on any of your items.</p>
            <p className="num mt-1 text-sm text-white/70">{unknownCode}</p>
            <p className="mt-2 text-sm text-white/70">
              Tell the till what it belongs to and it will know next time.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setAttachQuery("");
                  setPhase("attaching");
                }}
                className="tap flex-1 rounded-control bg-teal py-3 font-bold"
              >
                Say what this is
              </button>
              <button
                onClick={beginScanning}
                className="tap rounded-control border border-white/25 px-4 text-sm font-bold"
              >
                Scan another
              </button>
            </div>
          </div>
        )}

        {/* Picking the product the code belongs to. */}
        {phase === "attaching" && (
          <div className="rounded-card bg-white/10 p-4">
            <p className="font-bold">Which product is this?</p>
            <p className="num mt-1 text-sm text-white/70">{unknownCode}</p>

            <input
              value={attachQuery}
              onChange={(e) => setAttachQuery(e.target.value)}
              autoFocus
              placeholder="Search your items"
              className="mt-3 w-full rounded-control bg-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-teal-mint"
            />

            <div className="mt-3 max-h-[38vh] space-y-1 overflow-y-auto">
              {catalogue
                .filter((item) =>
                  attachQuery.trim() === ""
                    ? true
                    : item.name.toLowerCase().includes(attachQuery.trim().toLowerCase())
                )
                .slice(0, 40)
                .map((item) => (
                  <button
                    key={item.id}
                    disabled={attaching}
                    onClick={async () => {
                      setAttaching(true);
                      try {
                        await onAttach(item.id, unknownCode);
                        setFound({ ...item, barcode: unknownCode });
                        setPhase("found");
                      } finally {
                        setAttaching(false);
                      }
                    }}
                    className="tap flex w-full items-baseline justify-between gap-3 rounded-panel bg-white/5 px-3 py-3 text-left disabled:opacity-50"
                  >
                    <span className="truncate text-sm font-semibold">{item.name}</span>
                    <span className="num shrink-0 text-sm">{formatGHS(item.price)}</span>
                  </button>
                ))}
            </div>

            <p className="mt-3 text-xs text-white/50">
              Already has a barcode on another product? The till will say so
              rather than move it.
            </p>

            <button
              onClick={() => setPhase("unknown")}
              className="tap mt-2 w-full rounded-control border border-white/25 py-2.5 text-sm font-bold"
            >
              Go back
            </button>
          </div>
        )}

        {/* Typing the number always works, whatever the device can do */}
        {(phase === "manual" || phase === "scanning") && (
          <div className={phase === "manual" ? "" : "mt-4"}>
            <label htmlFor="code" className="mono text-[11px] uppercase tracking-eyebrow text-white/50">
              Or type the barcode number
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="code"
                value={manualCode}
                inputMode="numeric"
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitManual()}
                placeholder="The number under the bars"
                className="num flex-1 rounded-control bg-white/10 px-4 py-3 text-white placeholder:text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-teal-mint"
              />
              <button
                onClick={submitManual}
                disabled={!manualCode.trim()}
                className="tap rounded-control bg-teal px-5 font-bold disabled:opacity-40"
              >
                Find
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
