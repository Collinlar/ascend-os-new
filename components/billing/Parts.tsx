// Small pieces the Plans and billing screens share (round 3, P4).

import type { ReactNode } from "react";

const TONE: Record<string, string> = {
  ok: "bg-success-tint text-success-ink",
  warn: "bg-gold-tint text-gold-ink",
  info: "bg-info-light text-info-ink",
  mute: "bg-neutral-100 text-neutral-700",
  teal: "bg-teal-50 text-teal-800",
  bad: "bg-danger-tint text-danger-ink",
};

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex h-[22px] flex-none items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-bold ${TONE[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-line-brand bg-white px-[18px] py-4 sm:px-5 ${className}`}>{children}</section>;
}

export const KIND_TONE: Record<string, keyof typeof TONE> = {
  Free: "teal",
  Paid: "info",
  Sponsored: "warn",
  "From Ascend": "mute",
  Offer: "warn",
};

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", year: "numeric" });
}
