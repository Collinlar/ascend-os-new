import Link from "next/link";
import { STATE_HEADLINE, type RiskNotice } from "@/lib/risk/notice";

// The line at the top of the business's home when Ascend has limited it
// (Risk and Trust R5). It says what happened and where to read more; the
// detail and the appeal live on /standing.

export default function RiskBanner({ notice }: { notice: RiskNotice }) {
  const serious = notice.state !== "restricted";
  const appeal = notice.appeal?.status === "open" ? " Your appeal is with Ascend." : "";
  return (
    <Link
      href="/standing"
      className={`tap block rounded-[18px] border px-5 py-4 ${
        serious ? "border-danger-ink/20 bg-danger-tint" : "border-gold/30 bg-gold-light"
      }`}
    >
      <p className={`text-[15px] font-bold ${serious ? "text-danger-ink" : "text-gold-ink"}`}>
        {STATE_HEADLINE[notice.state]}
      </p>
      <p className="mt-0.5 text-sm font-medium text-ink">
        {notice.message}
        {appeal}
      </p>
      <p className={`mt-2 text-sm font-bold underline underline-offset-4 ${serious ? "text-danger-ink" : "text-gold-ink"}`}>
        See what is limited and how to appeal
      </p>
    </Link>
  );
}
