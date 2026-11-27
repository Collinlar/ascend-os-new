import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import { Card, Pill, day } from "@/components/billing/Parts";
import { AskForIt, CancelOrder, TopUpPicker } from "@/components/billing/BillingActions";
import { MODULES } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { ascendWhatsApp, bankDetails, ghs, loadBilling, type Offer } from "@/lib/billing/load";

export const dynamic = "force-dynamic";

// Getting something from Ascend (round 3, P4), the design's checkout:
// what it is, how long, the summary, and how to pay. MoMo and card in the
// app wait for Paystack (decision 6); until then the business asks here,
// pays Ascend by transfer quoting the reference, and Ascend records it.

const INCLUDES: Record<string, string[]> = {
  documents_plus: [
    "Your logo on every quote, invoice and receipt",
    "Your colour, and the Modern or Compact template",
    "Your own numbering, like ADW-0001, with or without the year",
    "Business details, TIN, footer and signature areas stay free",
  ],
  office: ["Give work out and follow it to done", "Approve requests from your team", "Attendance and leave in one place"],
  advanced_inventory: ["Send stock from one place and receive it at another", "Stock by branch", "Purchasing, expiry dates and stock value"],
};

function length(o: Offer): string {
  if (o.days === 365) return "12 months";
  if (o.days === 182) return "6 months";
  if (o.days === 30) return "One month";
  return "Once";
}

export default async function GetPage({ params }: { params: { sku: string } }) {
  await checkPageAccess("/billing");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.billing}>
        <EmptyState title="Sign in to see this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const d = await loadBilling(workspace.businessId);
  const topUp = params.sku === "top-up";
  const offer = topUp ? null : d.offers.find((o) => o.sku === params.sku);
  if (!topUp && !offer) notFound();

  const name = topUp ? "Top up your Ascend Balance" : (offer as Offer).name.replace(/, .*$/, "");
  const waiting = d.orders.find((o) => o.status === "waiting" && (topUp ? o.kind === "top_up" : o.sku === params.sku));
  const justPaid = d.orders.find((o) => o.status === "paid" && (topUp ? o.kind === "top_up" : o.sku === params.sku) && o.recordedAt && Date.now() - new Date(o.recordedAt).getTime() < 7 * 864e5);
  const bands = offer?.productSet ? d.offers.filter((o) => o.productSet === offer.productSet && o.mode === "buy") : [];
  const bank = bankDetails();
  const wa = ascendWhatsApp(d.manager, waiting ? `Hello, this is ${d.businessName}. About my order ${waiting.reference}.` : `Hello, this is ${d.businessName}.`);

  return (
    <ModulePage identity={MODULES.billing} title={topUp ? "Top up" : `Get ${name}`}>
      <Link href={topUp ? "/billing/usage" : "/billing/add"} className="tap mb-3 inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-teal-700 hover:text-teal-800">
        Back to {topUp ? "usage and receipts" : "everything Ascend offers"}
      </Link>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {justPaid && (
            <Card className="border-success-ink/30 bg-success-tint">
              <strong className="font-heading text-[17px] text-success-ink">{topUp ? `${ghs(justPaid.amount)} is in your Balance` : `${name} is on`}</strong>
              <p className="mt-1 text-[13.5px] text-ink">
                Ascend recorded your payment on {day(justPaid.recordedAt as string)}. Receipt {justPaid.reference}.{" "}
                <Link href={`/billing/receipt/${justPaid.id}`} className="font-semibold text-teal-700 underline-offset-2 hover:underline">Open the receipt</Link>
              </p>
            </Card>
          )}

          <Card>
            <h2 className="font-heading text-[18px] font-bold text-ink-heading">{name}</h2>
            <p className="mt-1 text-[13.5px] text-neutral-600">
              {topUp ? "Pays for Discover promotion. Your sales and settlements are never touched." : offer?.blurb}
            </p>
            {offer?.active && (
              <p className="mt-2 text-[13.5px] font-semibold text-success-ink">
                Active {offer.activeUntil ? `until ${day(offer.activeUntil)}` : "now"}. Buying again adds the time on from that date, so no days are lost.
              </p>
            )}
            {offer?.productSet && INCLUDES[offer.productSet] && (
              <ul className="mt-3 flex flex-col gap-2">
                {INCLUDES[offer.productSet].map((line) => (
                  <li key={line} className="flex gap-2 text-[13.5px] text-ink">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-teal" />
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {topUp ? (
            !waiting && (
              <Card>
                <h2 className="font-heading text-base font-bold text-ink-heading">How much</h2>
                <div className="mt-3">
                  <TopUpPicker businessId={workspace.businessId} />
                </div>
              </Card>
            )
          ) : (
            bands.length > 1 && (
              <Card>
                <h2 className="font-heading text-base font-bold text-ink-heading">Choose your size</h2>
                <div className="mt-3 flex flex-col gap-2">
                  {bands.map((b) => (
                    <Link
                      key={b.sku}
                      href={`/billing/get/${b.sku}`}
                      aria-current={b.sku === offer?.sku ? "true" : undefined}
                      className={`tap flex min-h-[52px] items-center justify-between gap-3 rounded-[14px] border-[1.5px] px-4 ${b.sku === offer?.sku ? "border-teal-700 bg-teal-50" : "border-neutral-200"}`}
                    >
                      <span className="text-[14px] font-semibold text-ink">{b.name.replace(/^[^,]*, /, "")}</span>
                      <span className="num text-[14px] font-bold text-ink">{ghs(b.amount)}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className="font-heading text-base font-bold text-ink-heading">Summary</h2>
            {topUp ? (
              <p className="mt-2 text-[13.5px] text-neutral-700">{waiting ? `${ghs(waiting.amount)} top-up` : "Pick an amount."}</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5 text-[13.5px]">
                <span className="flex justify-between gap-3"><span className="text-neutral-600">{name}</span><span className="num font-semibold text-ink">{ghs((offer as Offer).amount)}</span></span>
                <span className="flex justify-between gap-3"><span className="text-neutral-600">How long</span><span className="text-ink">{length(offer as Offer)}</span></span>
                <span className="mt-1 flex justify-between gap-3 border-t border-neutral-100 pt-2 font-bold"><span className="text-ink">Total</span><span className="num text-ink">{ghs((offer as Offer).amount)}</span></span>
                <span className="text-[12.5px] text-neutral-500">{offer?.days ? "Nothing renews by itself. If it ends, you keep all your data and documents." : "Paid once."}</span>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-heading text-base font-bold text-ink-heading">Pay with</h2>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-teal-700 bg-teal-50 px-4 py-3">
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-bold text-ink">Bank transfer or MoMo to Ascend</span>
                  <span className="text-[12.5px] text-neutral-600">Switches on when Ascend records the money</span>
                </span>
                <Pill tone="teal">Now</Pill>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[14px] border border-neutral-200 px-4 py-3">
                <span className="text-[13.5px] text-neutral-600">MoMo or card in the app</span>
                <Pill tone="mute">Coming</Pill>
              </div>
            </div>
          </Card>

          <Card>
            {waiting ? (
              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-500">Your reference</span>
                  <p className="num font-mono text-[22px] font-bold text-ink-heading">{waiting.reference}</p>
                </div>
                <p className="text-[13.5px] leading-relaxed text-ink">
                  Pay <strong>{ghs(waiting.amount)}</strong> to Ascend and put <strong>{waiting.reference}</strong> as the reference.{" "}
                  {bank ? "" : "Ascend sends you the account details on WhatsApp the same working day."}
                </p>
                {bank && <p className="whitespace-pre-line rounded-[12px] bg-neutral-50 px-3 py-2 text-[13px] text-ink">{bank}</p>}
                <p className="text-[12.5px] text-neutral-600">
                  {topUp ? "It reaches your Balance" : `${name} switches on`} as soon as Ascend records the money. Paid to Ascend, never from your sales.
                </p>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="tap inline-flex min-h-[44px] items-center text-[13.5px] font-bold text-teal-700 hover:text-teal-800">
                    {d.manager ? `WhatsApp ${d.manager.name} about it` : "WhatsApp Ascend about it"}
                  </a>
                )}
                <CancelOrder businessId={workspace.businessId} orderId={waiting.id} />
              </div>
            ) : topUp ? (
              <p className="text-[13.5px] text-neutral-700">Pick an amount on the left. You get a reference to pay with.</p>
            ) : !d.ready || offer?.mode !== "buy" ? (
              <p className="text-[13.5px] text-neutral-700">This is not something you can ask for here yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <AskForIt businessId={workspace.businessId} sku={offer.sku} label={`Get ${name} for ${ghs(offer.amount)}`} />
                <p className="text-[12.5px] text-neutral-600">You get a reference to pay with. Nothing is charged until you pay it.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}
