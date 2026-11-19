"use client";

// A sheet over the till: from the bottom on a handheld, centred on a
// counter screen. Light, like the rest of the v3 till.

import { Icon } from "@/components/shell/icons";

export default function TillSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 lg:items-center lg:p-6" role="dialog" aria-modal aria-label={title}>
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl lg:max-h-[80dvh] lg:max-w-[520px] lg:rounded-[24px]">
        <div className="flex flex-none items-center justify-between border-b border-neutral-100 py-2 pl-4 pr-2">
          <span className="font-heading text-[17px] font-extrabold text-ink-heading">{title}</span>
          <button onClick={onClose} aria-label="Close" className="tap flex w-11 items-center justify-center rounded-control text-neutral-600">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
