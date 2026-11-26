"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The dark note after an action (business modules design, M1): "Reminder
// sent to Efua on WhatsApp." It says what happened and goes by itself; it
// never asks for anything, so it never needs a button.

export function useToast(ms = 3200) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), ms);
    },
    [ms]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-8">
      {message && (
        <p className="animate-sheetup rounded-control bg-navy px-4 py-3 text-[13.5px] font-semibold text-white shadow-float">{message}</p>
      )}
    </div>
  );
}
