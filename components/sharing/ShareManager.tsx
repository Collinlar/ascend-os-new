"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SHAREABLE_FIELDS } from "@/lib/sharing/fields";

export interface ShareRow {
  id: string;
  purpose: string | null;
  fields: string[];
  status: string;
  grantedAt: string;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
}

export default function ShareManager({ shares }: { shares: ShareRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([
    "business_identity",
    "sustainability_score",
    "evidence_confidence",
  ]);
  const [purpose, setPurpose] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function create() {
    if (selected.length === 0) {
      setError("Choose at least one thing to share.");
      return;
    }
    if (purpose.trim().length < 3) {
      setError("Say who this is for. It is recorded with the share.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: selected,
          purpose: purpose.trim(),
          expiresInDays: parseInt(days, 10) || 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not create that share. Tap again.");
        return;
      }
      setNewLink(data.url);
      setCreating(false);
      setPurpose("");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(shareId: string) {
    setBusy(shareId);
    setError(null);
    try {
      const res = await fetch("/api/sharing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "We could not stop that share. Tap again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-dark">
          {error}
        </p>
      )}

      {newLink && (
        <div className="border border-teal bg-teal-light px-5 py-5">
          <p className="text-sm font-medium text-teal-dark">
            Send this link to them. We will not show it again.
          </p>
          <p className="mt-2 break-all bg-white px-3 py-2 text-sm text-ink">
            {newLink}
          </p>
          <button
            onClick={() => setNewLink(null)}
            className="tap mt-3 text-sm font-medium text-teal-dark underline"
          >
            I have copied it
          </button>
        </div>
      )}

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="tap w-full bg-teal px-5 py-3.5 font-medium text-white"
        >
          Share my record with someone
        </button>
      ) : (
        <div className="border border-line bg-white p-5">
          <h2 className="font-medium text-ink">What they will see</h2>
          <p className="mt-1 text-sm text-mid-grey">
            They never see your customers, your staff, or individual sales.
            Only what you tick below.
          </p>

          <div className="mt-4 space-y-2">
            {SHAREABLE_FIELDS.map((field) => (
              <label
                key={field.key}
                className="flex cursor-pointer items-start gap-3 border border-line px-3 py-3"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(field.key)}
                  onChange={() => toggle(field.key)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-teal"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {field.label}
                  </span>
                  <span className="block text-xs text-mid-grey">{field.detail}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Who is this for? e.g. Stanbic loan application"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-mid-grey focus:border-teal focus:outline-none"
            />
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full border border-line px-3 py-2.5 text-ink focus:border-teal focus:outline-none"
              aria-label="How long they can see it"
            >
              <option value="7">They can see it for 7 days</option>
              <option value="30">They can see it for 30 days</option>
              <option value="90">They can see it for 90 days</option>
            </select>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCreating(false)}
              className="tap flex-1 border border-line py-3 font-medium text-ink"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={busy === "create"}
              className="tap flex-[2] bg-teal py-3 font-medium text-white disabled:opacity-60"
            >
              {busy === "create" ? "Creating..." : "Create the link"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {shares.length === 0 && (
          <div className="border border-line bg-white px-5 py-10 text-center">
            <p className="font-medium text-ink">Nobody can see your record.</p>
            <p className="mt-2 text-sm text-mid-grey">
              Nothing is shared until you choose to share it.
            </p>
          </div>
        )}

        {shares.map((share) => {
          const live = share.status === "active";
          const expired =
            share.expiresAt !== null && new Date(share.expiresAt) < new Date();
          return (
            <div key={share.id} className="border border-line bg-white px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">
                  {share.purpose ?? "No purpose recorded"}
                </p>
                <p
                  className={`text-sm ${
                    !live ? "text-mid-grey" : expired ? "text-mid-grey" : "text-teal-dark"
                  }`}
                >
                  {!live ? "Stopped" : expired ? "Expired" : "Can see it now"}
                </p>
              </div>

              <p className="mt-1 text-xs text-mid-grey">
                {share.fields.length} thing{share.fields.length === 1 ? "" : "s"} shared ·{" "}
                {share.viewCount === 0
                  ? "never opened"
                  : `opened ${share.viewCount} time${share.viewCount === 1 ? "" : "s"}${
                      share.lastViewedAt ? `, last ${timeAgo(share.lastViewedAt)}` : ""
                    }`}
              </p>

              {live && !expired && (
                <button
                  onClick={() => revoke(share.id)}
                  disabled={busy === share.id}
                  className="tap mt-3 text-sm font-medium text-gold-dark disabled:opacity-60"
                >
                  {busy === share.id ? "Stopping..." : "Stop this sharing now"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return "just now";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
