import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import { day } from "@/components/billing/Parts";
import { PrintReceipt } from "@/components/billing/BillingActions";
import { MODULES } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { supabaseServer } from "@/lib/supabase";
import { ghs } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// A receipt for something paid to Ascend (round 3, P4). Only for the
// business's own paid orders; printing saves it as a PDF.

const PAID_WITH: Record<string, string> = { bank_transfer: "Bank transfer", momo: "MoMo", cash: "Cash", card: "Card" };

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  await checkPageAccess("/billing");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.billing}>
        <EmptyState title="Sign in to see this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const db = supabaseServer();
  const [{ data: o }, { data: look }, { data: biz }] = await Promise.all([
    db.from("ascend_order").select("id, reference, kind, description, amount, currency_code, status, paid_with, payment_reference, recorded_at").eq("id", params.id).eq("business_id", workspace.businessId).maybeSingle(),
    db.from("document_branding").select("trading_name, tin, email, address_line").eq("business_id", workspace.businessId).maybeSingle(),
    db.from("business").select("name").eq("id", workspace.businessId).maybeSingle(),
  ]);
  if (!o || o.status !== "paid") notFound();

  return (
    <ModulePage identity={MODULES.billing} title="Receipt">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href="/billing/usage" className="tap inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-teal-700 hover:text-teal-800">Back to usage and receipts</Link>
        <PrintReceipt />
      </div>
      <article className="mx-auto mt-3 w-full max-w-[640px] rounded-[20px] border border-line-brand bg-white px-6 py-7 print:border-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-[20px] font-extrabold text-ink-heading">AscendSME</p>
            <p className="text-[12.5px] text-neutral-600">Bold Vision MultiTech, Accra</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-500">Receipt</p>
            <p className="font-mono text-[15px] font-bold text-ink">{o.reference as string}</p>
            <p className="text-[12.5px] text-neutral-600">{day(o.recorded_at as string)}</p>
          </div>
        </div>
        <div className="mt-6 text-[13px]">
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-500">Received from</p>
          <p className="font-semibold text-ink">{(look?.trading_name as string) || (biz?.name as string)}</p>
          {look?.address_line && <p className="text-neutral-700">{look.address_line as string}</p>}
          {look?.tin && <p className="text-neutral-700">TIN {look.tin as string}</p>}
        </div>
        <table className="mt-6 w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11.5px] text-neutral-500">
              <th className="py-2 font-semibold">What</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100">
              <td className="py-3 text-ink">{o.kind === "top_up" ? "Ascend Balance top-up" : (o.description as string)}</td>
              <td className="num py-3 text-right font-semibold text-ink">{ghs(Number(o.amount))}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-bold text-ink">Paid</td>
              <td className="num pt-3 text-right font-bold text-ink">{ghs(Number(o.amount))}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-6 text-[12.5px] text-neutral-600">
          Paid by {PAID_WITH[o.paid_with as string] ?? "transfer"}
          {o.payment_reference ? `, reference ${o.payment_reference as string}` : ""}. Paid to Ascend, never from your sales.
        </p>
      </article>
    </ModulePage>
  );
}
