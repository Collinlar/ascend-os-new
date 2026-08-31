"use client";

import { useState } from "react";
import { callApi } from "@/lib/http";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState } from "@/components/shell/Page";

export interface DeviceRow {
  id: string;
  label: string;
  status: string;
  model: string | null;
  lastSyncAt: string | null;
  pendingCount: number;
  leaseExpiresAt: string | null;
  /** What this till has rung up today. */
  takingsToday: number;
  /** Whether somebody has a shift open on it right now. */
  selling: boolean;
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
        <p className="rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      {code ? (
        <div className="rounded-[18px] border border-teal-pale bg-teal-light px-5 py-6 text-center">
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
          className="tap flex w-full items-center justify-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Creating your code..." : "Set up a new till"}
        </button>
      )}

      {devices.length === 0 ? (
        <EmptyState
          title="No tills set up yet."
          detail="Create a code above, then type it on the selling device."
        />
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            const stopped =
              device.status === "revoked" || device.status === "retired";
            return (
              <div
                key={device.id}
                className="flex flex-col gap-4 rounded-[18px] border border-line-soft bg-white px-[22px] py-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control bg-teal-light"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect
                          x="3"
                          y="7"
                          width="18"
                          height="12"
                          rx="2.4"
                          stroke="#0B6F65"
                          strokeWidth="1.7"
                        />
                        <path d="M3 11h18" stroke="#0B6F65" strokeWidth="1.7" />
                        <path
                          d="M7 15h3"
                          stroke="#0B6F65"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold tracking-[-0.02em] text-ink">
                        {device.label}
                      </p>
                      <p className="text-xs font-medium text-slate-grey">
                        {device.lastSyncAt
                          ? `Last sent ${timeAgo(device.lastSyncAt)}`
                          : "Has never sent a sale"}
                      </p>
                    </div>
                  </div>
                  {device.pendingCount > 0 && (
                    <span className="num flex-none rounded-full bg-gold-tint px-2.5 py-0.5 text-[11.5px] font-extrabold text-gold-ink">
                      {device.pendingCount} unsent
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-[7px] w-[7px] rounded-full ${
                      device.selling
                        ? "bg-teal-live ring-[3px] ring-teal-live/20"
                        : stopped
                          ? "bg-danger-ink"
                          : "bg-line-stronger"
                    }`}
                  />
                  <span
                    className={`text-[12.5px] font-bold ${
                      device.selling
                        ? "text-teal-dark"
                        : stopped
                          ? "text-danger-ink"
                          : "text-slate-grey"
                    }`}
                  >
                    {device.selling
                      ? "Selling"
                      : STATUS_LABEL[device.status] ?? device.status}
                  </span>
                  <span aria-hidden className="h-3 w-px bg-line" />
                  <span className="num text-[12.5px] font-semibold text-slate-grey">
                    {formatGHS(device.takingsToday)} today
                  </span>
                </div>

                {!stopped && (
                  <div className="flex flex-wrap gap-2">
                    {confirming === device.id ? (
                      <>
                        <p className="w-full text-[13px] font-medium text-ink">
                          Stop this till? It cannot sell after this.
                        </p>
                        <button
                          onClick={() => stopDevice(device.id)}
                          disabled={busy}
                          className="tap flex items-center rounded-chip bg-danger-tint px-4 text-[13px] font-bold text-danger-ink disabled:opacity-60"
                        >
                          Yes, stop it
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate"
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirming(device.id)}
                        className="tap flex items-center rounded-chip bg-danger-tint px-4 text-[13px] font-bold text-danger-ink"
                      >
                        Stop this till
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
