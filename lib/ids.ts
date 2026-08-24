import { ulid } from "ulid";

// Client-generated identifiers for offline-capable actions (OFL-006,
// POS-OFF-003). ULIDs are sortable, globally unique and safe to generate on
// a disconnected terminal. A retried sync produces exactly one server record.
export function newClientRef(prefix: string): string {
  return `${prefix}_${ulid()}`;
}

// Receipt numbering that tolerates offline devices (POS-RCP-008):
// device-scoped sequence embedded in the number so two terminals can never
// collide, and the number is stable before and after sync.
// Format: R-{deviceShort}-{yyyymmdd}-{seq}
export function receiptNumber(
  deviceShort: string,
  businessDate: Date,
  deviceSeq: number
): string {
  const d = businessDate;
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `R-${deviceShort}-${ymd}-${String(deviceSeq).padStart(4, "0")}`;
}
