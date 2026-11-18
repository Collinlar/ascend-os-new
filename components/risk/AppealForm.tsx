"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/http";
import { Panel } from "@/components/shell/Page";

// The owner's appeal (Risk and Trust R5). Their own words, and what they can
// show. It goes on the case for a person at Ascend to read.

export default function AppealForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (text.trim().length < 20) {
      setError("Tell Ascend a little more. A few sentences is enough.");
      return;
    }
    setSending(true);
    setError(null);
    const result = await callApi<{ ok: true }>("/api/business/risk-appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, appealText: text }),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Panel className="px-5 py-5">
      <label htmlFor="appeal-text" className="block text-[15px] font-bold text-ink">
        What should Ascend know?
      </label>
      <p className="mt-1 text-sm font-medium text-slate-grey">
        Say what happened in your own words, and what you can show: receipts, MoMo statements, messages with
        customers. Someone who did not make this decision will read it.
      </p>
      <textarea
        id="appeal-text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={6}
        placeholder="The three refunds on 12 November were for spoiled rice. I have the MoMo statements."
        className="mt-3 w-full rounded-chip border border-line px-3 py-2 text-base text-ink"
      />
      <p className="mt-1 text-right text-xs text-ink-muted">{2000 - text.length} left</p>
      {error && (
        <p className="mt-2 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="tap mt-3 flex min-h-[44px] w-full items-center justify-center rounded-chip bg-teal px-4 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-60 sm:w-auto"
      >
        {sending ? "Sending your appeal to Ascend..." : "Send my appeal"}
      </button>
    </Panel>
  );
}
