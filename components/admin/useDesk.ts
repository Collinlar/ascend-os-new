"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One way for every Risk desk control to talk to /api/admin/risk: one thing
// at a time, the database's refusal shown in words, the page refreshed when
// something changed.

export function useDesk() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post<T = Record<string, unknown>>(
    key: string,
    body: Record<string, unknown>,
    { refresh = true }: { refresh?: boolean } = {}
  ): Promise<T | null> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Try again.");
        return null;
      }
      if (refresh) router.refresh();
      return data as T;
    } catch {
      setError("We could not reach Ascend just now. Check the connection and try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { busy, error, setError, post, router };
}
