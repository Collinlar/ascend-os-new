import { headers } from "next/headers";

// The address a customer would type.
//
// Built from the request rather than from window, so a link is in the page
// the merchant is handed instead of appearing a moment later once the
// browser catches up. That matters most on the one panel whose entire
// purpose is the link.
export function originFromRequest(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
