"use client";

import { useState } from "react";
import { callApi } from "@/lib/http";
import { useRouter } from "next/navigation";

export interface DeviceRow {
  id: string;
  label: string;
  status: string;
  model: string | null;
  lastSyncAt: string | null;
  pendingCount: number;
  leaseExpiresAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  registered: "Waiting for first sale",
  active: "Selling",
  revoked: "Stopped",
  retired: "Retired",
};

export default function DeviceManager({
  businessId,
  locationId,
  devices,
}: {
  businessId: string;
  locationId: string | null;
  devices: DeviceRow[];
}) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The address the new device has to open. Built from wherever this
  // dashboard is being used, so it is right on localhost and in production
  // without anything being configured.
  const tillUrl =
    typeof window === "undefined"
      ? "/pos"
      : `${window.location.origin}/pos${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function generateCode() {
    if (!locationId) {
      setError("Add a location to your business first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await callApi<{ code: string }>("/api/devices/pairing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, locationId, label: `Till ${devices.length + 1}` }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode(result.data.code);
    } finally {
      setBusy(false);
    }
  }

  async function stopDevice(deviceId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/devices/pairing-code", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not stop that till. Tap again.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-dark">
          {error}
        </p>
      )}

      {code ? (
        <div className="border border-teal bg-teal-light px-5 py-6 text-center">
          {/* A code alone is not instructions. The device that needs it has
              never been told to open the till, and its owner is standing in
              front of a marketing page wondering where to type. */}
          <p className="text-sm font-semibold text-teal-dark">
            On the other device, open this address
          </p>
          <p className="num mt-2 break-all rounded-panel bg-white px-3 py-2 text-sm text-ink">
            {tillUrl}
          </p>

          <p className="mt-4 text-sm text-teal-dark">then type this code</p>
          <p className="mt-1 text-4xl font-semibold tracking-widest text-teal-dark">
            {code}
          </p>
          <p className="mt-3 text-sm text-teal-dark">
            It works once, for 30 minutes. We will not show it again.
          </p>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(tillUrl).then(
                () => setCopied(true),
                () => setCopied(false)
              );
            }}
            className="tap mt-4 rounded-control border border-teal px-4 py-2 text-sm font-semibold text-teal-dark"
          >
            {copied ? "Link copied" : "Copy the link"}
          </button>

          <p className="mt-3 text-xs text-teal-dark">
            Opening that link on this device would turn this one into the new
            till instead.
          </p>

          <button
            onClick={() => {
              setCode(null);
              router.refresh();
            }}
            className="tap mt-4 text-sm font-medium text-teal-dark underline"
          >
            Done setting up
          </button>
        </div>
      ) : (
        <button
          onClick={generateCode}
          disabled={busy}
          className="tap w-full bg-teal px-5 py-3.5 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Creating your code..." : "Set up a new till"}
        </button>
      )}

      <div className="space-y-2">
        {devices.length === 0 && (
          <div className="border border-line bg-white px-5 py-10 text-center">
            <p className="font-medium text-ink">No tills set up yet.</p>
            <p className="mt-2 text-sm text-mid-grey">
              Create a code above, then type it on the selling device.
            </p>
          </div>
        )}

        {devices.map((device) => (
          <div key={device.id} className="border border-line bg-white px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{device.label}</p>
                <p className="text-xs text-mid-grey">
                  {STATUS_LABEL[device.status] ?? device.status}
                  {device.lastSyncAt && ` · last sent ${timeAgo(device.lastSyncAt)}`}
                </p>
              </div>
              {device.pendingCount > 0 && (
                <span className="text-sm text-gold-dark">
                  {device.pendingCount} unsent
                </span>
              )}
            </div>

            {device.status !== "revoked" && device.status !== "retired" && (
              <div className="mt-3">
                {confirming === device.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink">
                      Stop this till? It cannot sell after this.
                    </span>
                    <button
                      onClick={() => stopDevice(device.id)}
                      disabled={busy}
                      className="tap bg-gold-dark px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Yes, stop it
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="tap px-3 py-2 text-sm font-medium text-mid-grey"
                    >
                      Keep it
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(device.id)}
                    className="tap text-sm font-medium text-gold-dark"
                  >
                    Stop this till
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
