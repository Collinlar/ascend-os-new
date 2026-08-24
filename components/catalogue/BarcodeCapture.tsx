"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeCamera,
  openCamera,
  scanCapability,
  setTorch,
  startDetectionLoop,
  torchSupported,
} from "@/lib/pos/scan";

// Capturing one barcode, wherever it is needed.
//
// Deliberately separate from the till's scan sheet, which matches against a
// catalogue and fills a basket. This one only answers the question "what
// number is on this label", so it can serve the products screen, the till
// and anything later.
//
// Every device that cannot scan can still type. A merchant holding a
// product must never reach a dead end because their phone is the wrong
// model.

export default function BarcodeCapture({
  title = "Scan the barcode",
  onCapture,
  onClose,
}: {
  title?: string;
  onCapture: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoopRef = useRef<(() => void) | null>(null);

  const [manualOnly, setManualOnly] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [canTorch, setCanTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const handleCode = useCallback(
    (code: string) => {
      stopLoopRef.current?.();
      stopLoopRef.current = null;
      onCapture(code);
    },
    [onCapture]
  );

  useEffect(() => {
    const capability = scanCapability();
    if (capability.kind !== "ready") {
      setManualOnly(true);
      setProblem(
        capability.kind === "no_detector"
          ? "This phone cannot read barcodes with its camera. Type the number under the bars."
          : capability.kind === "insecure"
            ? "Scanning needs a secure connection. Type the number under the bars."
            : "No camera on this device. Type the number under the bars."
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
        setManualOnly(true);
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

  async function toggleTorch() {
    const next = !torchOn;
    setTorchOn(next);
    await setTorch(streamRef.current, next);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-bold">{title}</span>
        <button onClick={onClose} className="tap px-2 text-sm font-bold text-white/70">
          Cancel
        </button>
      </header>

      {!manualOnly && (
        <div className="relative mx-4 overflow-hidden rounded-card bg-black/50">
          <video
            ref={videoRef}
            className="h-[46vh] w-full object-cover"
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-x-8 inset-y-16 rounded-panel border-2 border-teal-mint/70" />
          <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/80">
            Hold the barcode inside the box
          </p>
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

      <div className="px-4 pb-6 pt-4">
        {problem && (
          <p className="mb-4 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-dark">
            {problem}
          </p>
        )}

        <label htmlFor="typed-code" className="mono text-[11px] uppercase tracking-eyebrow text-white/50">
          {manualOnly ? "Barcode number" : "Or type it instead"}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="typed-code"
            value={typed}
            inputMode="numeric"
            autoFocus={manualOnly}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed.trim()) onCapture(typed.trim());
            }}
            placeholder="The number under the bars"
            className="num flex-1 rounded-control bg-white/10 px-4 py-3 text-white placeholder:text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-teal-mint"
          />
          <button
            onClick={() => typed.trim() && onCapture(typed.trim())}
            disabled={!typed.trim()}
            className="tap rounded-control bg-teal px-5 font-bold disabled:opacity-40"
          >
            Use this
          </button>
        </div>
      </div>
    </div>
  );
}
