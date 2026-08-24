// Client-safe: the list of things a business may choose to share, with the
// plain-language description shown on the consent screen.
//
// Deliberately kept free of any Node import. This module is pulled into the
// browser bundle by the consent UI, and importing crypto here would drag a
// polyfill into every client that renders the list.

export const SHAREABLE_FIELDS = [
  {
    key: "business_identity",
    label: "Who your business is",
    detail: "Name, city and whether your identity is verified",
  },
  {
    key: "sustainability_score",
    label: "Your Sustainability Score",
    detail: "The score and what goes into it",
  },
  {
    key: "evidence_confidence",
    label: "How verified your record is",
    detail: "How much comes from verified sources rather than your own word",
  },
  {
    key: "trust_level",
    label: "Your trust level",
    detail: "Identity verification and record strength",
  },
  {
    key: "revenue_summary",
    label: "Monthly revenue totals",
    detail: "Totals per month only, never individual sales",
  },
  {
    key: "document_summary",
    label: "Document counts",
    detail: "How many invoices you issued and settled, never their contents",
  },
  {
    key: "activity_summary",
    label: "Activity counts",
    detail: "How many sales, orders and services, never who they were with",
  },
] as const;

export type ShareableFieldKey = (typeof SHAREABLE_FIELDS)[number]["key"];
