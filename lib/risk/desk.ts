// Words for the Risk desk (Risk and Trust R6). The database speaks in keys
// and exception codes; the desk speaks to an admin deciding about a real
// business.

export const DOMAIN_LABEL: Record<string, string> = {
  refund_abuse: "Refunds and reversals",
  payment_fraud: "Payment fraud",
  cash_discipline: "Cash discipline at the till",
  fake_merchant: "Fake or duplicate business",
  messaging_abuse: "Messaging abuse",
  customer_complaint: "Customer complaint",
  identity_fraud: "Identity fraud",
  account_takeover: "Account takeover",
  prohibited_goods: "Prohibited goods",
  counterfeit_goods: "Counterfeit goods",
  field_agent_misconduct: "Field agent misconduct",
  commission_fraud: "Commission fraud",
  device_compromise: "Device compromise",
  insider_risk: "Insider risk",
  api_abuse: "API abuse",
  ai_action_abuse: "AI action abuse",
  settlement_manipulation: "Settlement manipulation",
  other: "Other",
};

/** The areas offered when opening a case by hand, most likely first. */
export const DOMAINS_TO_OPEN = [
  "customer_complaint",
  "refund_abuse",
  "payment_fraud",
  "cash_discipline",
  "fake_merchant",
  "messaging_abuse",
  "prohibited_goods",
  "counterfeit_goods",
  "identity_fraud",
  "account_takeover",
  "other",
];

export const STATES = ["normal", "monitor", "review", "restricted", "suspended", "terminated"] as const;

export const STATE_LABEL: Record<string, { name: string; means: string }> = {
  normal: { name: "Normal", means: "Nothing special. The business sees nothing." },
  monitor: { name: "Monitor", means: "Watched quietly. The business sees nothing." },
  review: { name: "Review", means: "Being looked into. The business sees nothing." },
  restricted: { name: "Restricted", means: "Some things paused. The business sees what, and can appeal." },
  suspended: {
    name: "Suspended",
    means: "Read and export only. Needs a second admin to confirm. The business sees it and can appeal.",
  },
  terminated: {
    name: "Terminated",
    means: "Closed on Ascend. Needs a second admin to confirm. The business can still read its records.",
  },
};

/** What the current state means, once it is in place (no "needs a second admin"). */
export function stateNow(state: string): string {
  return (STATE_LABEL[state]?.means ?? "").replace(" Needs a second admin to confirm.", "");
}

export const CONTROL_LABEL: Record<string, string> = {
  payment_collection: "Online payment collection",
  refunds: "Refunds and till reversals",
  marketing_messages: "Marketing messages",
  discover_listing: "Discover listing",
};
export const CONTROLS = Object.keys(CONTROL_LABEL);

export const EVENT_LABEL: Record<string, string> = {
  opened: "Opened the case",
  note: "Note",
  state_changed: "Changed the state",
  state_requested: "Asked a second admin to confirm",
  state_confirmed: "Confirmed",
  state_declined: "Declined the request",
  resolved: "Closed the case",
  restriction_set: "Paused",
  restriction_lifted: "Lifted",
  business_message_set: "Wrote the line the business reads",
  appeal_received: "The business appealed",
  appeal_decided: "Answered the appeal",
};

const ERRORS: Array<[RegExp, number, string]> = [
  [/admin_only/, 403, "Only a BVM admin can act on risk."],
  [/second_admin_needed/, 409, "You asked for this, so another admin confirms it. Two people decide a suspension or a termination."],
  [/awaiting_confirmation/, 409, "A suspension or termination is waiting for a second admin. Confirm or decline it first."],
  [/case_resolved/, 409, "This case is closed. Open a new case to change anything on this business."],
  [/nothing_to_confirm|nothing_to_decline/, 409, "There is nothing waiting for confirmation on this case any more. Refresh to see what changed."],
  [/case_not_open_for_business/, 409, "That case is closed now. Open a new case from this report instead."],
  [/another_admin/, 409, "You made or confirmed this decision, so another admin hears the appeal against it."],
  [/state_moved/, 409, "The business's state has changed since this appeal. Decide it from the case."],
  [/business_not_found/, 404, "We could not find that business. Search for it again."],
  [/case_not_found|report_not_found|appeal_not_found/, 404, "We could not find that any more. Refresh the page."],
  [/state_unknown|control_unknown|outcome_unknown/, 422, "Pick one of the choices shown."],
  [/message_too_short/, 422, "Write at least a sentence, or leave it empty to use the standard line."],
  [/_needed|too_short/, 422, "Say why, in a sentence. It goes on the case."],
];

export function deskError(raw: string): { message: string; status: number } {
  const hit = ERRORS.find(([re]) => re.test(raw));
  return hit
    ? { status: hit[1], message: hit[2] }
    : { status: 500, message: "We could not save that. Nothing was changed. Try again." };
}
