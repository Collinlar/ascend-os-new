"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

// Ask a customer for what they owe, now (Modules M3, 0140). Ascend sends it
// when it can. When it cannot (no balance, no consent, or WhatsApp has not
// approved the reminder message yet) it says why and offers the merchant
// their own WhatsApp with the same words, so the ask still happens.

export interface RemindResult {
  sent: boolean;
  why?: string;
  ownWhatsApp?: string | null;
  error?: string;
}

export async function sendReminder(documentId: string): Promise<RemindResult> {
  try {
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remind" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, error: data.error ?? "That did not go through. Tap again." };
    return data as RemindResult;
  } catch {
    return { sent: false, error: "We could not reach Ascend just now. Check your connection and tap again." };
  }
}

export default function RemindButton({
  documentId,
  label = "Send reminder",
  primary = false,
  onSent,
}: {
  documentId: string;
  label?: string;
  primary?: boolean;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemindResult | null>(null);

  async function go() {
    setBusy(true);
    const r = await sendReminder(documentId);
    setBusy(false);
    setResult(r);
    if (r.sent) {
      onSent?.();
      router.refresh();
    }
  }

  return (
    <span className="flex flex-col gap-1.5">
      <button type="button" onClick={go} disabled={busy || result?.sent} className={`${primary ? primaryAction : secondaryAction} min-h-[40px] justify-center disabled:opacity-60`}>
        <Icon name="send" size={15} />
        {busy ? "Sending the reminder..." : result?.sent ? "Reminder sent" : label}
      </button>
      {result && !result.sent && (
        <span role="alert" className="text-xs font-semibold text-gold-700">
          {result.error ?? result.why}
          {result.ownWhatsApp && (
            <>
              {" "}
              <a href={result.ownWhatsApp} target="_blank" rel="noopener noreferrer" className="font-bold text-teal-dark underline">
                Send it from your WhatsApp
              </a>
            </>
          )}
        </span>
      )}
    </span>
  );
}
