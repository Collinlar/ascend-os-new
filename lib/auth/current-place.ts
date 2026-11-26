import { cookies } from "next/headers";

// Which of the business's places you are looking at (Modules M1).
//
// Like the business choice beside it, this is a selector and nothing more.
// It is unsigned on purpose: the workspace resolver only honours it when it
// names an active place of the business you opened that your membership
// reaches. A forged or stale value is ignored and the first place is used.

const COOKIE_NAME = "ascend_place";
const DAYS = 30;

export function currentPlaceChoice(): string | null {
  return cookies().get(COOKIE_NAME)?.value ?? null;
}

export function choosePlace(locationId: string): void {
  cookies().set(COOKIE_NAME, locationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + DAYS * 86400_000),
  });
}
