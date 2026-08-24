import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentPersonId } from "@/lib/auth/session";
import SignInForm from "@/components/auth/SignInForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · AscendSME",
  description: "Open your business with the WhatsApp number you set it up with.",
};

// The door for a business that already exists.
//
// Until now the only way in was the way in for the first time: the landing
// page's "Sign in" pointed at the dashboard, the signed out dashboard
// pointed at onboarding, and onboarding asked a returning owner for their
// business name, their city and their own name before it would send them a
// code. Every one of those was already stored. There was no sign in.
export default async function SignInPage() {
  // Already signed in. Nobody arrives here on purpose in that state, so
  // send them where they were going rather than showing a form that would
  // sign them in as themselves again.
  if (await currentPersonId()) redirect("/dashboard");

  return <SignInForm />;
}
