"use client";

import { useState } from "react";
import { DOMAIN_LABEL, DOMAINS_TO_OPEN } from "@/lib/risk/desk";
import { useDesk } from "./useDesk";

// Opening a risk case (Risk and Trust R6). From a signal, the business, the
// area and the first line come filled in, with the signal's figures kept as
// the case's evidence. By hand, the admin finds the business first. Opening
// a case limits nothing: it is where the decisions get written down.

interface Preset {
  businessId: string;
  businessName: string;
  domain: string;
  trigger: string;
  evidence?: Record<string, unknown>;
}

interface Found {
  id: string;
  name: string;
  shop_slug: string | null;
  status: string;
  created_at: string;
}

const inputClass = "mt-1 w-full rounded-chip border border-line px-3 py-2 text-base text-ink";

export default function OpenCase({ preset, label = "Open a case" }: { preset?: Preset; label?: string }) {
  const { busy, error, setError, post, router } = useDesk();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [business, setBusiness] = useState<{ id: string; name: string } | null>(
    preset ? { id: preset.businessId, name: preset.businessName } : null
  );
  const [domain, setDomain] = useState(preset?.domain ?? "customer_complaint");
  const [trigger, setTrigger] = useState(preset?.trigger ?? "");

  async function search() {
    const out = await post<{ businesses: Found[] }>("find", { action: "find_business", query }, { refresh: false });
    setFound(out?.businesses ?? []);
  }

  async function openIt() {
    if (!business) return;
    const out = await post<{ outcome: { case_id: string } }>(
      "open",
      { action: "open_case", businessId: business.id, domain, trigger, evidence: preset?.evidence ?? {} },
      { refresh: false }
    );
    if (out?.outcome?.case_id) router.push(`/admin/risk/cases/${out.outcome.case_id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate hover:bg-light-grey"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-panel border border-line bg-surface px-4 py-4">
      {!business ? (
        <>
          <label htmlFor="case-business" className="block text-sm font-semibold text-ink">
            Which business?
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="case-business"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Its name, or its shop link"
              className="min-h-[44px] w-full rounded-chip border border-line px-3 text-base text-ink"
            />
            <button
              type="button"
              onClick={search}
              disabled={busy === "find"}
              className="tap flex min-h-[44px] shrink-0 items-center rounded-chip bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy === "find" ? "Looking..." : "Find it"}
            </button>
          </div>
          {found && found.length === 0 && (
            <p className="mt-2 text-sm font-medium text-slate-grey">No business by that name. Try part of the name.</p>
          )}
          {found && found.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {found.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBusiness({ id: b.id, name: b.name })}
                  className="tap flex min-h-[44px] flex-col items-start rounded-chip border border-line bg-white px-3 py-2 text-left hover:bg-light-grey"
                >
                  <span className="text-sm font-bold text-ink">{b.name}</span>
                  <span className="text-xs font-medium text-slate-grey">
                    {b.shop_slug ? `/${b.shop_slug} · ` : ""}joined{" "}
                    {new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {b.status !== "active" ? ` · ${b.status}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink">
            A case on <span className="font-bold">{business.name}</span>
            {!preset && (
              <button type="button" onClick={() => setBusiness(null)} className="ml-2 text-sm font-bold text-teal-dark underline">
                Change
              </button>
            )}
          </p>
          <label htmlFor="case-domain" className="mt-3 block text-sm font-semibold text-ink">
            What kind of risk
          </label>
          <select
            id="case-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-1 min-h-[44px] w-full rounded-chip border border-line bg-white px-3 text-base text-ink"
          >
            {Array.from(new Set([domain, ...DOMAINS_TO_OPEN])).map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d] ?? d}
              </option>
            ))}
          </select>
          <label htmlFor="case-trigger" className="mt-3 block text-sm font-semibold text-ink">
            What started it
          </label>
          <textarea
            id="case-trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            rows={2}
            placeholder="A customer called about a MoMo payment with no delivery"
            className={inputClass}
          />
          <p className="mt-1 text-xs font-medium text-slate-grey">
            Opening a case limits nothing. You decide that on the case.
          </p>
        </>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-gold-ink">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {business && (
          <button
            type="button"
            onClick={openIt}
            disabled={busy === "open"}
            className="tap flex min-h-[44px] items-center rounded-chip bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy === "open" ? "Opening the case..." : "Open the case"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
