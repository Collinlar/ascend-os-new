"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AttentionRow } from "./AttentionList";
import { Icon } from "./icons";

// The desktop top bar (business modules design, M1).
//
// Search and the primary action belong to the page, so the bar only holds
// the slots: the module header band fills them (ModuleBand), and a page with
// no search leaves the space empty rather than offering a box that finds
// nothing. The place switcher and the bell belong to the business, so they
// live here and on the phone's top bar alike.

export const SEARCH_SLOT = "topbar-search";
export const ACTION_SLOT = "topbar-action";

export interface Place {
  id: string;
  name: string;
}

// A menu that closes on a tap outside it and on Escape.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
  return ref;
}

/** Which place the figures and lists follow. Only when there is a choice. */
export function PlaceSwitcher({ places, current, compact = false }: { places: Place[]; current: string | null; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  if (places.length < 2) return null;
  const here = places.find((p) => p.id === current) ?? places[0];

  async function pick(id: string) {
    if (id === here.id) return setOpen(false);
    setSaving(id);
    setError(null);
    try {
      const res = await fetch("/api/business/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "That did not go through. Tap the place again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Looking at ${here.name}. Change place`}
        className={`tap flex min-h-[40px] items-center gap-2 rounded-control border border-line-brand bg-white font-semibold text-teal-800 hover:border-teal-brand ${
          compact ? "max-w-[150px] px-2.5 text-[12.5px]" : "px-3.5 text-[13.5px]"
        }`}
      >
        <Icon name="pin" size={16} />
        <span className="truncate">{here.name}</span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-panel border border-neutral-100 bg-white p-2 shadow-float"
        >
          <p className="px-3 pb-1.5 pt-1 text-xs font-medium text-neutral-500">Which place are you looking at?</p>
          {places.map((p) => {
            const on = p.id === here.id;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                disabled={saving !== null}
                onClick={() => pick(p.id)}
                className={`tap flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm disabled:opacity-60 ${
                  on ? "bg-teal-50 font-bold text-teal-800" : "font-medium text-ink hover:bg-neutral-50"
                }`}
              >
                <span className="flex-1 truncate">{p.name}</span>
                {saving === p.id ? (
                  <span className="text-xs text-neutral-500">Opening...</span>
                ) : (
                  on && <Icon name="check" size={16} />
                )}
              </button>
            );
          })}
          {error && (
            <p role="alert" className="px-3 pb-1 pt-2 text-xs font-medium text-danger-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TONE: Record<AttentionRow["tone"], string> = {
  gold: "bg-gold-100 text-gold-700",
  teal: "bg-teal-50 text-teal-800",
  red: "bg-danger-tint text-danger-ink",
};

/** What is waiting on the owner: Home's attention list, counted. */
export function Bell() {
  const [rows, setRows] = useState<AttentionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attention", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { rows: AttentionRow[] };
      setRows(body.rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Once when the shell opens, and again each time the list is opened, so
  // the count is never older than the last look.
  useEffect(() => {
    load();
  }, [load]);

  const count = rows?.length ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rows === null ? "Needs you" : count > 0 ? `Needs you, ${count} waiting` : "Needs you, nothing waiting"}
        className="tap relative flex h-10 w-10 items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-50"
      >
        <Icon name="bell" size={19} />
        {count > 0 && (
          <span className="num absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-orange-700 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Needs you"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-panel border border-neutral-100 bg-white shadow-float"
        >
          <p className="px-4 pb-2 pt-3.5 font-heading text-[15px] font-bold text-ink-heading">Needs you</p>
          {failed && rows === null ? (
            <div className="border-t border-neutral-100 px-4 py-3.5 text-sm text-neutral-600">
              We could not check just now.{" "}
              <button type="button" onClick={load} className="font-semibold text-teal-dark underline">
                Check again
              </button>
            </div>
          ) : rows === null ? (
            <p className="border-t border-neutral-100 px-4 py-3.5 text-sm text-neutral-600">Looking at what is waiting...</p>
          ) : rows.length === 0 ? (
            <p className="border-t border-neutral-100 px-4 py-3.5 text-sm text-neutral-600">Nothing is waiting on you right now.</p>
          ) : (
            rows.map((row) => (
              <Link
                key={row.id}
                href={row.href}
                onClick={close}
                className="tap flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5 hover:bg-teal-50"
              >
                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[9px] ${TONE[row.tone]}`}>
                  <Icon name={row.icon} size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="text-[13px] font-semibold text-ink">{row.title}</span>
                  <span className="text-xs font-medium text-teal-dark">{row.action}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** The bar itself, above the page on a desktop. */
export default function TopBar({ places, current, bell }: { places: Place[]; current: string | null; bell: boolean }) {
  return (
    <div className="sticky top-0 z-20 hidden h-16 items-center gap-3 border-b border-neutral-100 bg-white px-7 lg:flex">
      <div id={SEARCH_SLOT} className="flex min-w-0 flex-[0_1_480px]" />
      <span className="flex-1" />
      <PlaceSwitcher places={places} current={current} />
      {bell && <Bell />}
      <div id={ACTION_SLOT} className="flex flex-none items-center gap-2" />
    </div>
  );
}
