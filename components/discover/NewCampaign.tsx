"use client";

// New campaign (round 3, P2), from the design: what to promote, who should
// see it, the daily budget and how long, how it looks on Discover, and
// what to expect. Charged only for days it runs, never more than the daily
// budget (decision 1). Submitted for Ascend's review.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import { formatGHS } from "@/lib/money";

export interface CampaignListing {
  id: string;
  name: string;
  kind: "product" | "service" | "shop";
  price: number | null;
  photo: string | null;
  category: string | null;
  categoryLabel: string | null;
}

type Kind = "product" | "service" | "shop" | "location";

const TYPES: Array<{ key: Kind | "collection" | "spotlight"; label: string; detail: string; icon: Parameters<typeof Icon>[0]["name"]; later?: string }> = [
  { key: "product", label: "Product Boost", detail: "One product, near your shops", icon: "box" },
  { key: "service", label: "Service Boost", detail: "Fill empty booking slots", icon: "calendar" },
  { key: "shop", label: "Shop Boost", detail: "Your whole Shop", icon: "store" },
  { key: "location", label: "Location Boost", detail: "One branch, walk-ins", icon: "pin" },
  { key: "collection", label: "Collection", detail: "A group, like a bridal set", icon: "grid", later: "Ask Ascend to set up a collection for you." },
  { key: "spotlight", label: "Spotlight", detail: "Top of Discover home, by request", icon: "target", later: "Spotlight is by request. Ask Ascend." },
];
const BUDGETS = [10, 20, 50, 100];
const LENGTHS = [7, 14, 30];
const RADII = [3, 5, 10];

export default function NewCampaign({
  businessName,
  verified,
  listings,
  places,
  balance,
  initialListing,
}: {
  businessName: string;
  verified: boolean;
  listings: CampaignListing[];
  places: Array<{ id: string; name: string; city: string | null }>;
  balance: number;
  initialListing: string | null;
}) {
  const first = listings.find((l) => l.id === initialListing);
  const [kind, setKind] = useState<Kind>(first ? (first.kind === "service" ? "service" : first.kind === "shop" ? "shop" : "product") : "product");
  const [note, setNote] = useState<string | null>(null);
  const forKind = useMemo(
    () => listings.filter((l) => (kind === "shop" || kind === "location" ? l.kind === "shop" : l.kind === kind)),
    [listings, kind]
  );
  const [listingId, setListingId] = useState<string | null>(initialListing);
  const listing = forKind.find((l) => l.id === listingId) ?? forKind[0] ?? null;
  const [placeIds, setPlaceIds] = useState<string[]>(places.slice(0, 1).map((p) => p.id));
  const [radius, setRadius] = useState(5);
  const [interests, setInterests] = useState<string[]>(() =>
    [first?.categoryLabel ?? listings[0]?.categoryLabel].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase()).slice(0, 1)
  );
  const [word, setWord] = useState("");
  const [daily, setDaily] = useState(20);
  const [days, setDays] = useState(7);
  const [estimate, setEstimate] = useState<{ reach_low: number; reach_high: number; clicks_low: number; clicks_high: number; campaigns: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ most: number } | null>(null);

  const most = daily * days;
  const coverDays = Math.floor(balance / daily);
  const chosenPlaces = places.filter((p) => placeIds.includes(p.id));

  // The estimate follows the choices, only from enough history (decision 3).
  useEffect(() => {
    let live = true;
    setEstimate(undefined);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/discover/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "estimate", category: listing?.category ?? null, dailyBudget: daily, days }),
        });
        const out = await res.json().catch(() => ({}));
        if (live) setEstimate(out.estimate ?? null);
      } catch {
        if (live) setEstimate(null);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [listing?.category, daily, days]);

  function pickType(t: (typeof TYPES)[number]) {
    if (t.later) {
      setNote(t.later);
      return;
    }
    setNote(null);
    setKind(t.key as Kind);
    setListingId(null);
    if (t.key === "location") setPlaceIds((prev) => prev.slice(0, 1));
  }

  function togglePlace(id: string) {
    if (kind === "location") return setPlaceIds([id]);
    setPlaceIds((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  }

  function addWord() {
    const w = word.trim().toLowerCase().slice(0, 30);
    if (!w || interests.includes(w) || interests.length >= 8) return setWord("");
    setInterests([...interests, w]);
    setWord("");
  }

  async function submit() {
    if (!listing) return setError("Choose what to promote.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discover/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_campaign", listingId: listing.id, kind, dailyBudget: daily, days, placeIds, radiusKm: radius, interests }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not go through. Tap again.");
        return;
      }
      setDone({ most: Number(out.most ?? most) });
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-[20px] border border-line-brand bg-white px-6 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-800">
          <Icon name="clock" size={26} />
        </span>
        <h2 className="font-heading text-xl font-extrabold text-ink-heading">Submitted for review</h2>
        <p className="text-[14px] leading-relaxed text-neutral-700">
          Ascend checks it against Discover rules. It goes live as soon as it passes, and you only pay for the days it runs.
        </p>
        <div className="mt-2 w-full rounded-[14px] bg-neutral-50 px-4 py-3 text-left text-[13.5px]">
          <p className="flex justify-between gap-3">
            <span className="text-neutral-600">Campaign</span>
            <span className="text-right font-semibold text-ink">
              {listing?.name} · {TYPES.find((t) => t.key === kind)?.label}
            </span>
          </p>
          <p className="mt-1 flex justify-between gap-3">
            <span className="text-neutral-600">Budget</span>
            <span className="num text-right font-semibold text-ink">
              {formatGHS(daily)} a day for {days} days
            </span>
          </p>
          <p className="mt-1 flex justify-between gap-3">
            <span className="text-neutral-600">Charged only once live</span>
            <span className="num text-right font-semibold text-ink">Up to {formatGHS(done.most)}</span>
          </p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/promote" className={primaryAction}>
            Back to Promotions
          </Link>
          <button type="button" onClick={() => setDone(null)} className={secondaryAction}>
            Create another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <Card>
          <H2>What do you want to promote?</H2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pickType(t)}
                aria-pressed={kind === t.key}
                className={`tap flex flex-col items-start gap-1 rounded-[14px] border-[1.5px] p-3 text-left ${
                  kind === t.key ? "border-teal-700 bg-teal-50" : "border-neutral-200 bg-white hover:border-teal-brand"
                } ${t.later ? "opacity-70" : ""}`}
              >
                <span className="text-teal-800">
                  <Icon name={t.icon} size={18} />
                </span>
                <span className="text-[13.5px] font-bold text-ink">{t.label}</span>
                <span className="text-xs text-neutral-600">{t.later ? "Ask Ascend" : t.detail}</span>
              </button>
            ))}
          </div>
          {note && <p className="rounded-control bg-gold-100 px-3 py-2 text-[13px] font-semibold text-gold-700">{note}</p>}
          {forKind.length === 0 ? (
            <p className="text-[13px] text-neutral-600">
              {kind === "service"
                ? "None of your services is showing on Discover yet. A service with a price on your booking page is listed for free."
                : kind === "product"
                  ? "None of your products is showing on Discover yet. A product with a photo and a price on your live Shop is listed for free."
                  : "Your shop is not showing on Discover yet."}
            </p>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-neutral-700">{kind === "shop" || kind === "location" ? "Your listing" : kind === "service" ? "Which service" : "Which product"}</span>
              <select
                value={listing?.id ?? ""}
                onChange={(e) => setListingId(e.target.value)}
                className="min-h-[44px] w-full rounded-control border border-neutral-200 bg-white px-3 text-base text-ink focus:border-teal focus:outline-none sm:text-[13.5px]"
              >
                {forKind.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.price !== null ? ` · ${formatGHS(l.price)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Card>

        <Card>
          <H2>Who should see it?</H2>
          <Label>{kind === "location" ? "Which branch" : "Near which shops"}</Label>
          <div className="flex flex-wrap gap-1.5">
            {places.map((p) => (
              <Chip key={p.id} on={placeIds.includes(p.id)} onClick={() => togglePlace(p.id)}>
                {placeIds.includes(p.id) && <Icon name="check" size={14} />}
                {p.name}
                {p.city ? `, ${p.city}` : ""}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-neutral-600">Within</span>
            {RADII.map((r) => (
              <Chip key={r} on={radius === r} onClick={() => setRadius(r)}>
                {r} km
              </Chip>
            ))}
          </div>
          <Label>People looking for</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {interests.map((w) => (
              <span key={w} className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-teal-50 pl-3 pr-1 text-[13px] font-semibold text-teal-800">
                {w}
                <button type="button" onClick={() => setInterests(interests.filter((x) => x !== w))} aria-label={`Remove ${w}`} className="tap flex h-8 w-8 items-center justify-center rounded-full">
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
            {interests.length < 8 && (
              <span className="flex items-center gap-1">
                <input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addWord();
                    }
                  }}
                  maxLength={30}
                  placeholder="braids, natural hair"
                  aria-label="Something people look for"
                  className="min-h-[36px] w-[150px] rounded-full border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13px]"
                />
                <button type="button" onClick={addWord} className="tap inline-flex min-h-[36px] items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-teal-700">
                  <Icon name="plus" size={14} />
                  Add
                </button>
              </span>
            )}
          </div>
          <Hint>
            Shown when someone searches one of these words, or for {listing?.name ?? "it"} itself. We never share anyone&rsquo;s personal data with you. Until Discover knows where a customer is, it shows to people searching in {chosenPlaces.map((p) => p.city).filter(Boolean).join(" or ") || "your shops' cities"}.
          </Hint>
        </Card>

        <Card>
          <H2>Budget and dates</H2>
          <Label>Daily budget</Label>
          <div className="flex flex-wrap gap-1.5">
            {BUDGETS.map((b) => (
              <Chip key={b} on={daily === b} onClick={() => setDaily(b)}>
                GHS {b}
              </Chip>
            ))}
          </div>
          <Label>How long</Label>
          <div className="flex flex-wrap gap-1.5">
            {LENGTHS.map((d) => (
              <Chip key={d} on={days === d} onClick={() => setDays(d)}>
                {d} days
              </Chip>
            ))}
          </div>
          <Hint>Starts after review, usually within a few hours. You only pay for days it runs, never more than the daily budget. Pause any time.</Hint>
        </Card>
      </div>

      <div className="flex flex-col gap-3.5 lg:sticky lg:top-[88px]">
        <Card>
          <Label>How customers see it on Discover</Label>
          <div className="flex gap-3 rounded-[14px] border border-neutral-100 p-3">
            <span className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-[12px] bg-teal-50 font-heading text-lg font-extrabold text-teal-800">
              {listing?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.photo} alt="" width={64} height={64} className="h-full w-full object-cover" />
              ) : (
                (listing?.name ?? businessName).slice(0, 1)
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="self-start rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-700">Sponsored</span>
              <span className="truncate text-[14px] font-bold text-ink">{kind === "shop" || kind === "location" ? businessName : listing?.name ?? "Your listing"}</span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-600">
                {businessName}
                {verified && <span className="font-semibold text-teal-800">· Verified</span>}
              </span>
              <span className="text-xs text-neutral-600">
                {listing?.price != null ? `${formatGHS(listing.price)} · ` : ""}within {radius} km
              </span>
            </span>
          </div>
          <Hint>{verified ? "Your Verified badge comes from your checks, not from this campaign. " : ""}The Sponsored label is always shown.</Hint>
        </Card>

        <Card>
          <H2>What to expect</H2>
          <Row k="People reached" v={estimate === undefined ? "Working it out..." : estimate ? `${estimate.reach_low.toLocaleString("en-GH")} to ${estimate.reach_high.toLocaleString("en-GH")}` : "Not enough history yet"} />
          {estimate && <Row k="Clicks" v={`${estimate.clicks_low.toLocaleString("en-GH")} to ${estimate.clicks_high.toLocaleString("en-GH")}`} />}
          <Row k="Most you will pay" v={formatGHS(most)} strong />
          <Row k="Charged to" v={`Ascend Balance, ${formatGHS(balance)}`} />
          {balance < most && (
            <p className="rounded-control bg-gold-100 px-3 py-2 text-[12.5px] font-semibold text-gold-700">
              {coverDays < 1
                ? `Your Balance does not cover one day yet. Top up first.`
                : `Your Balance covers ${coverDays} of ${days} days. Top up to run the full campaign, or it pauses when the Balance runs out.`}
            </p>
          )}
          <Hint>
            {estimate
              ? `Based on ${estimate.campaigns} campaigns like this in the last 60 days. Not a guarantee.`
              : "An estimate shows once there are at least 10 campaigns like this in the last 60 days."}
          </Hint>
          {error && (
            <p role="alert" className="rounded-control bg-danger-tint px-3 py-2 text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
          <button type="button" onClick={submit} disabled={busy || !listing || coverDays < 1} className={`${primaryAction} min-h-[46px] justify-center disabled:opacity-60`}>
            {busy ? "Sending it for review..." : "Submit for review"}
          </button>
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-panel border border-line-brand bg-white p-4 sm:p-[18px]">{children}</section>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-[16px] font-bold text-ink-heading">{children}</h2>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">{children}</span>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs leading-relaxed text-neutral-600">{children}</span>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`tap inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${
        on ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
      }`}
    >
      {children}
    </button>
  );
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <span className="flex justify-between gap-3 text-[13px]">
      <span className="text-neutral-600">{k}</span>
      <span className={`num text-right ${strong ? "font-extrabold text-ink" : "font-semibold text-ink"}`}>{v}</span>
    </span>
  );
}
