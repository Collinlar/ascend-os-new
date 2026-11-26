"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

// One way to call the Office route from any Office screen (Modules M2), so
// every button says the same thing when the network drops and refreshes the
// screen the same way when it works.

export function useOfficeAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
      setBusy(key);
      setError(null);
      try {
        const res = await fetch("/api/office/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((data as { error?: string }).error ?? "That did not go through. Tap again.");
          return null;
        }
        router.refresh();
        return data as Record<string, unknown>;
      } catch {
        setError("We could not reach Ascend just now. Check your connection and tap again.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [router]
  );

  return { run, busy, error, setError };
}

export const fieldClass =
  "w-full min-h-[44px] rounded-control border-[1.5px] border-neutral-200 bg-white px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";
