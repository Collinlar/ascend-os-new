"use client";

// The light frame the till's one-off screens sit in: setting the till up,
// opening a shift, closing it. The v3 till is a light screen at both sizes;
// only the PIN pad stays navy, as the design has it.

export const tillInput =
  "mt-2 h-14 w-full rounded-control border-[1.5px] border-line-brand bg-white px-4 font-heading text-[24px] font-bold text-ink-heading placeholder:font-body placeholder:text-[16px] placeholder:font-normal placeholder:text-neutral-500 focus:border-teal focus:outline-none";

export const tillPrimary =
  "tap flex h-14 w-full items-center justify-center rounded-[14px] bg-teal font-heading text-[17px] font-extrabold text-white disabled:opacity-40";

export const tillSecondary =
  "tap flex h-14 w-full items-center justify-center rounded-[14px] border-[1.5px] border-neutral-200 bg-white text-[15px] font-bold text-ink";

export default function TillFrame({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string | null;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-8 text-ink">
      <div className="w-full max-w-md rounded-[24px] border border-line-brand bg-white p-6 shadow-[0_18px_40px_rgba(2,60,55,0.08)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">{eyebrow ?? "Ascend POS"}</p>
        <h1 className="mt-2 font-heading text-[26px] font-extrabold leading-tight text-ink-heading">{title}</h1>
        {intro && <div className="mt-2 text-[15px] leading-relaxed text-neutral-600">{intro}</div>}
        {children}
      </div>
    </main>
  );
}
