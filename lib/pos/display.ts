// The customer display: a second window on the same device, dragged to the
// screen that faces the customer, showing what they are buying and what to
// pay. The till tells it through a BroadcastChannel, which needs no network
// and never leaves the device.
//
// The display holds nothing of its own. It shows the last state the till
// sent, and when it opens it asks the till to send it again.

export type DisplayStage = "welcome" | "sale" | "paying" | "thanks";

export interface DisplayState {
  stage: DisplayStage;
  business: string;
  /** The cashier's first name: "Served by Ama". */
  servedBy?: string;
  lines: { qty: number; name: string; total: number }[];
  subtotal: number;
  discount?: { label: string; amount: number };
  total: number;
  /** First name only: this screen faces the shop. */
  customerFirst?: string;
  /** How they are paying, once the cashier has picked. */
  method?: string;
  change?: number;
  sentAt: number;
}

const CHANNEL = "ascend-customer-display";

type Message = { kind: "state"; state: DisplayState } | { kind: "hello" };

function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL);
}

/** The till's side. Sends a state, and answers a display that just opened. */
export function displaySender(current: () => DisplayState | null) {
  const ch = channel();
  if (!ch) return { send: () => {}, close: () => {} };
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.kind === "hello") {
      const s = current();
      if (s) ch.postMessage({ kind: "state", state: s } satisfies Message);
    }
  };
  return {
    send: (state: DisplayState) => ch.postMessage({ kind: "state", state } satisfies Message),
    close: () => ch.close(),
  };
}

/** The display's side. Calls back with every state the till sends. */
export function displayReceiver(onState: (s: DisplayState) => void): () => void {
  const ch = channel();
  if (!ch) return () => {};
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.kind === "state") onState(e.data.state);
  };
  ch.postMessage({ kind: "hello" } satisfies Message);
  return () => ch.close();
}

export function openCustomerDisplay(): void {
  // A window of its own, so it can be dragged to the second screen and put
  // full screen there. The name means a second tap brings the same window
  // forward rather than opening another.
  window.open("/pos/display", "ascend-customer-display", "popup,width=1024,height=600");
}
