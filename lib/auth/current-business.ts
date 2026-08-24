import { cookies } from "next/headers";

// Which of your businesses you are looking at.
//
// A person is one identity across every context (IDN-001), and that
// identity can hold more than one business. Signing in therefore has two
// answers: who you are, and which books you opened. The session cookie
// carries the first. This carries the second.
//
// It is deliberately not signed. It selects among businesses the person is
// already a member of, and every read revalidates that membership, so the
// worst a forged value can do is name a business you do not belong to and
// be ignored. Signing it would imply it grants something. It does not.

const COOKIE_NAME = "ascend_business";
const DAYS = 30;

export function currentBusinessChoice(): string | null {
  return cookies().get(COOKIE_NAME)?.value ?? null;
}

export function chooseBusiness(businessId: string): void {
  cookies().set(COOKIE_NAME, businessId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + DAYS * 86400_000),
  });
}

export function forgetBusinessChoice(): void {
  cookies().delete(COOKIE_NAME);
}
