"use client";

// Listing review and reports (round 3, P3), from the design. A listing that
// needs a change shows the words to fix, highlighted, with "Remove claim
// and resubmit"; a removed one shows the reason and takes an appeal with
// evidence. The product stays in the business's own Shop either way: only
// promotion on Discover waits, and nothing is charged meanwhile.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { StatusPill, type Tone } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";

export interface ReviewListing {
  id: string;
  name: string;
  description: string | null;
  status: string;
  reason: string | null;
  needsChange: boolean;
  flagged: string | null;
  flaggedField: string | null;
  resubmitted: boolean;
  appealed: boolean;
  evidence: Array<{ name: string; size: number }>;
  reviewedAt: string | null;
}

export interface ReportOutcome {
  id: string;
  what: string;
  when: string | null;
  outcome: string;
}

function state(l: ReviewListing): { text: string; tone: Tone; rank: number } {
  if (l.status === "suspended" && l.needsChange) return { text: "Needs a change", tone: "warn", rank: 0 };
  if (l.status === "suspended") return { text: "Removed", tone: "bad", rank: 1 };
  if (l.status === "pending_review") return { text: l.appealed ? "Appeal sent" : "Resubmitted", tone: "info", rank: 2 };
  return { text: "On Discover", tone: "ok", rank: 3 };
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short" });
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function ListingReview({ listings, outcomes }: { listings: ReviewListing[]; outcomes: ReportOutcome[] }) {
  const router = useRouter();
  const sorted = [...listings].sort((a, b) => state(a).rank - state(b).rank);
  const [selected, setSelected] = useState<string | null>(sorted[0]?.id ?? null);
  const l = sorted.find((x) => x.id === selected) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Array<{ name: string; type: string; base64: string; size: number }>>([]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discover/promote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not go through. Tap again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("We could not reach Ascend just now. Tap again in a moment.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 3) break;
      if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) {
        setError("Attach a PDF, JPG or PNG.");
        continue;
      }
      if (f.size > 2 * 1024 * 1024) {
        setError(`${f.name} is over 2 MB. Attach a smaller copy.`);
        continue;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject();
        r.readAsDataURL(f);
      }).catch(() => "");
      if (base64) next.push({ name: f.name, type: f.type, base64, size: f.size });
    }
    setFiles(next);
  }

  const text = l?.description ?? "";
  const at = l?.flagged ? text.indexOf(l.flagged) : -1;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="overflow-hidden rounded-[20px] border border-line-brand bg-white">
          <h2 className="px-[18px] pb-2 pt-4 font-heading text-base font-bold text-ink-heading">Listing review</h2>
          {sorted.length === 0 ? (
            <p className="px-[18px] pb-4 text-[13.5px] text-neutral-600">Nothing of yours is on Discover yet. Products with a photo and a price on your live Shop are listed for free.</p>
          ) : (
            sorted.map((x) => {
              const st = state(x);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setSelected(x.id);
                    setError(null);
                    setNote("");
                    setFiles([]);
                  }}
                  aria-pressed={x.id === selected}
                  className={`tap flex w-full items-center gap-3 border-t border-neutral-100 px-[18px] py-3 text-left ${x.id === selected ? "bg-teal-50" : "hover:bg-neutral-50"}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-semibold text-ink">{x.name}</span>
                    {x.reviewedAt && <span className="text-xs text-neutral-600">Reviewed {day(x.reviewedAt)}</span>}
                  </span>
                  <StatusPill tone={st.tone}>{st.text}</StatusPill>
                </button>
              );
            })
          )}
        </section>

        <section className="flex flex-col gap-2.5 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-base font-bold text-ink-heading">Reports about your business</h2>
            <span className="text-xs text-neutral-600">{outcomes.length} resolved</span>
          </div>
          {outcomes.length === 0 ? (
            <p className="text-[13px] text-neutral-600">No closed reports.</p>
          ) : (
            outcomes.map((o) => (
              <div key={o.id} className="flex flex-col gap-0.5 border-t border-neutral-100 pt-2.5">
                <span className="flex justify-between gap-2 text-[13.5px]">
                  <strong className="text-ink">{o.what}</strong>
                  {o.when && <span className="text-xs text-neutral-600">{day(o.when)}</span>}
                </span>
                <span className="text-[13px] text-neutral-700">{o.outcome}</span>
              </div>
            ))
          )}
          <p className="text-xs leading-relaxed text-neutral-600">Reporters stay anonymous. Repeated upheld reports can remove Trusted and pause promotion.</p>
        </section>
      </div>

      {l && (
        <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4 lg:sticky lg:top-[88px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
              {l.status === "suspended" && l.needsChange ? "Needs a change" : l.status === "suspended" ? "Removed from Discover" : l.status === "pending_review" ? "Waiting for Ascend" : "Listing"}
            </span>
            <StatusPill tone={state(l).tone}>{state(l).text}</StatusPill>
          </div>
          <h2 className="font-heading text-[17px] font-bold text-ink-heading">{l.name}</h2>

          {l.status === "suspended" && l.reason && (
            <p className="flex gap-2 rounded-control bg-gold-100 px-3 py-2.5 text-[13px] font-semibold text-gold-700">
              <Icon name="alert" size={16} />
              <span>{l.reason}</span>
            </p>
          )}

          {l.status === "suspended" && l.needsChange && (
            <>
              {l.flagged && at >= 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-neutral-600">{l.flaggedField === "name" ? "Name" : "Description"}</span>
                  <p className="rounded-control border border-neutral-200 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink">
                    {text.slice(0, at)}
                    <mark className="rounded bg-danger-tint px-1 font-semibold text-danger-ink">{l.flagged}</mark>
                    {text.slice(at + l.flagged.length)}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {l.flagged && at >= 0 && (
                  <button type="button" onClick={() => post({ action: "fix_listing", listingId: l.id, removeFlagged: true })} disabled={busy} className={`${primaryAction} disabled:opacity-60`}>
                    {busy ? "Resubmitting..." : "Remove claim and resubmit"}
                  </button>
                )}
                <Link href="/products" className={secondaryAction}>
                  Edit it myself
                </Link>
              </div>
              <button type="button" onClick={() => post({ action: "fix_listing", listingId: l.id, removeFlagged: false })} disabled={busy} className="tap self-start text-[13px] font-semibold text-teal-700 disabled:opacity-60">
                I have edited it, resubmit
              </button>
              <p className="text-xs text-neutral-600">The product stays visible in your own Shop while this is fixed. Only promotion on Discover waits.</p>
            </>
          )}

          {l.status === "suspended" && !l.needsChange && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-neutral-600">Your appeal</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder="What should Ascend know? Say what the documents show."
                  className="w-full resize-y rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                />
              </label>
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-2 rounded-control border border-neutral-200 px-3 py-2 text-[13px]">
                  <Icon name="file" size={15} />
                  <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  <span className="text-xs text-neutral-600">{kb(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`} className="tap flex h-8 w-8 items-center justify-center rounded-full text-neutral-600">
                    <Icon name="close" size={13} />
                  </button>
                </span>
              ))}
              {files.length < 3 && (
                <label className="tap inline-flex min-h-[44px] cursor-pointer items-center gap-2 self-start rounded-control border border-dashed border-neutral-300 px-4 text-[13px] font-bold text-teal-700">
                  <Icon name="plus" size={15} />
                  Attach a document or photo
                  <input type="file" accept="application/pdf,image/jpeg,image/png" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
                </label>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (!note.trim()) return setError("Say what Ascend should reconsider.");
                  if (await post({ action: "appeal", listingId: l.id, note, evidence: files.map(({ name, type, base64 }) => ({ name, type, base64 })) })) {
                    setNote("");
                    setFiles([]);
                  }
                }}
                disabled={busy}
                className={`${primaryAction} justify-center disabled:opacity-60`}
              >
                {busy ? "Sending your appeal..." : "Submit appeal"}
              </button>
              <p className="text-xs text-neutral-600">A different reviewer decides, within 2 working days. Nothing was charged: campaigns are only paid for on days they run.</p>
            </>
          )}

          {l.status === "pending_review" && (
            <>
              <p className="flex items-center gap-2 rounded-control bg-teal-50 px-3 py-2.5 text-[13px] font-semibold text-teal-800">
                <Icon name="check" size={16} />
                {l.appealed ? "Appeal sent. A different reviewer decides within 2 working days." : "Resubmitted. Usually checked within a few hours."}
              </p>
              {l.evidence.length > 0 && (
                <ul className="flex flex-col gap-1 text-[13px] text-neutral-700">
                  {l.evidence.map((f, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-neutral-600">{kb(f.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {l.status === "eligible" && (
            <p className="text-[13px] text-neutral-700">Showing on Discover. Nothing to do.</p>
          )}

          {error && (
            <p role="alert" className="rounded-control bg-danger-tint px-3 py-2 text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
