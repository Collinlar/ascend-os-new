import "server-only";

// What a business is told about a risk decision on it (Risk and Trust R5,
// migration 0115). The database decides what is shown: nothing at all
// below "restricted", and never an admin's own case notes.

import { supabaseServer } from "@/lib/supabase";

export type VisibleState = "restricted" | "suspended" | "terminated";

export interface RiskNotice {
  state: VisibleState;
  since: string;
  message: string;
  restrictions: Array<{ control: string; since: string }>;
  appeal: {
    status: "open" | "accepted" | "declined";
    submitted_at: string;
    decided_at: string | null;
    decision_note: string | null;
  } | null;
  canAppeal: boolean;
}

/** Null when there is nothing to tell the business, or it could not be read. */
export async function riskNotice(businessId: string): Promise<RiskNotice | null> {
  const { data, error } = await supabaseServer().rpc("business_risk_notice", { p_business: businessId });
  if (error || !data || !(data as { visible?: boolean }).visible) return null;
  const n = data as {
    state: VisibleState;
    since: string;
    message: string;
    restrictions: RiskNotice["restrictions"];
    appeal: RiskNotice["appeal"];
    can_appeal: boolean;
  };
  return {
    state: n.state,
    since: n.since,
    message: n.message,
    restrictions: n.restrictions ?? [],
    appeal: n.appeal ?? null,
    canAppeal: n.can_appeal,
  };
}

/** What each limit means to the person running the business. */
export const CONTROL_FOR_BUSINESS: Record<string, { what: string; still: string }> = {
  payment_collection: {
    what: "Customers paying you online through your Ascend invoice and shop links",
    still: "Cash and MoMo you take yourself still work, and so do your receipts.",
  },
  refunds: {
    what: "Refunds and reversing a sale at the till",
    still: "You can still sell. If a customer needs money back, talk to Ascend first.",
  },
  marketing_messages: {
    what: "Marketing messages to your customers",
    still: "Receipts, invoices and booking messages still go.",
  },
  discover_listing: {
    what: "Your listing on Ascend Discover",
    still: "Your own shop and booking links still work for anyone you send them to.",
  },
};

export const STATE_HEADLINE: Record<VisibleState, string> = {
  restricted: "Some things are paused on your business",
  suspended: "Your business is suspended on Ascend",
  terminated: "Ascend has closed your business on the platform",
};

export const STATE_MEANS: Record<VisibleState, string> = {
  restricted: "Everything else works as normal.",
  suspended:
    "You can still open your records and download them, but you cannot sell, invoice or change anything, and customers cannot order or book.",
  terminated:
    "You can still open your records and download them. Nothing new can be recorded.",
};
