"use client";

import { useState } from "react";
import { callApi } from "@/lib/http";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState, Panel, primaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

export interface DeviceRow {
  id: string;
  label: string;
  status: string;
  /** terminal (a dedicated till) or business_mobile (a phone). */
  mode: string;
  model: string | null;
  serial: string | null;
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
            className="tap mt-4 text-sm font-semibold text-teal-dark underline"
          >
            The new till is set up
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={generateCode} disabled={busy} className={`${primaryAction} w-full justify-center disabled:opacity-60 sm:w-auto`}>
            <Icon name="plus" size={16} />
            {busy ? "Creating your code..." : "Set up a new till"}
          </button>
        </div>
      )}

      {devices.length === 0 ? (
        <EmptyState
          title="No tills set up yet."
          detail="Create a code above, then type it on the selling device."
        />
      ) : (
        <Panel>
          <div
            aria-hidden
            className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${COLS}`}
          >
            <span>Device</span>
            <span>Kind</span>
            <span className="text-right">Today</span>
            <span>Last sync</span>
            <span>Status</span>
            <span />
          </div>
          {devices.map((device, i) => {
            const stopped = device.status === "revoked" || device.status === "retired";
            const chip = statusChip(device, stopped);
            const phone = device.mode === "business_mobile";
            return (
              <div key={device.id} className={i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"}>
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-[13.5px] ${COLS}`}>
                  <div className={`flex min-w-0 basis-full items-center gap-3 lg:basis-auto ${stopped ? "opacity-60" : ""}`}>
                    <span
                      aria-hidden
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-teal-50 text-teal-800"
                    >
                      <Icon name={phone ? "phone" : "device"} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-semibold text-ink">{device.label}</span>
                      <span className="truncate text-xs text-neutral-500">
                        {[device.model, device.serial].filter(Boolean).join(" · ") || (phone ? "A phone" : "A till")}
                        <span className="lg:hidden">
                          {" · "}
                          {device.lastSyncAt ? `last sent ${timeAgo(device.lastSyncAt)}` : "never sent a sale"}
                          {" · "}
                          {formatGHS(device.takingsToday)} today
                        </span>
                      </span>
                    </span>
                  </div>
                  <span className="hidden text-neutral-600 lg:block">
                    <span className="sr-only">Kind: </span>
                    {phone ? "Phone" : "Till"}
                  </span>
                  <span className="num hidden text-right font-semibold text-ink lg:block">
                    <span className="sr-only">Today: </span>
                    {formatGHS(device.takingsToday)}
                  </span>
                  <span className="hidden text-neutral-600 lg:block">
                    <span className="sr-only">Last sync: </span>
                    {device.lastSyncAt ? timeAgo(device.lastSyncAt) : "Never"}
                  </span>
                  <span className="flex-none">
                    <span className="sr-only">Status: </span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>
                  </span>
                  <span className="ml-auto flex flex-none justify-end lg:ml-0">
                    {!stopped && confirming !== device.id && (
                      <button
                        onClick={() => setConfirming(device.id)}
                        className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-danger-ink hover:border-danger-soft"
                      >
                        Stop this till
                      </button>
                    )}
                  </span>
                </div>
                {!stopped && confirming === device.id && (
                  <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-3">
                    <span className="text-[13px] text-neutral-600">Stop {device.label}? It cannot sell after this.</span>
                    <button
                      onClick={() => stopDevice(device.id)}
                      disabled={busy}
                      className="tap flex items-center rounded-control bg-danger-tint px-3.5 text-[13px] font-bold text-danger-ink disabled:opacity-60"
                    >
                      {busy ? "Stopping it..." : "Yes, stop it"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800"
                    >
                      Keep it
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
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

// The design's device table, from 1024px: device, kind, today, last sync,
// status, and the way to stop it.
const COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_80px_120px_120px_150px_140px] lg:items-center lg:gap-4";

function statusChip(device: DeviceRow, stopped: boolean): { text: string; cls: string } {
  if (stopped) return { text: STATUS_LABEL[device.status] ?? "Stopped", cls: "bg-danger-tint text-danger-ink" };
  if (device.pendingCount > 0) return { text: `${device.pendingCount} unsent`, cls: "bg-gold-100 text-gold-700" };
  if (device.selling) return { text: "Selling now", cls: "bg-success-tint text-success-ink" };
  if (device.status === "registered") return { text: "Waiting for first sale", cls: "bg-info-light text-info-ink" };
  return { text: "Not open", cls: "bg-neutral-100 text-neutral-700" };
}
