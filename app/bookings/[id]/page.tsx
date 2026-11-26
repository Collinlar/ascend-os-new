import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { Avatar, StatusPill, Timeline, type Tone } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import BookingActions from "@/components/services/BookingActions";
import RecordPayment from "@/components/payments/RecordPayment";
import { MODULES } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { currentWorkspace } from "@/lib/nav/workspace";
import { formatGHS } from "@/lib/money";
import { whatsappLink } from "@/lib/inventory/order-message";
import { loadBooking } from "@/lib/services/booking";

export const dynamic = "force-dynamic";

// One booking (Modules M4): who, when, with whom, where and for how much,
// how it has gone, the money, and the customer behind it.

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const localPhone = (e164: string) =>
  e164.startsWith("+233") && e164.length === 13 ? `0${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : e164;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" });

const STATE: Record<string, { text: string; tone: Tone }> = {
  requested: { text: "Wants to book", tone: "warn" },
  quoted: { text: "Price sent", tone: "info" },
  confirmed: { text: "Confirmed", tone: "teal" },
  in_progress: { text: "Happening now", tone: "info" },
  completed: { text: "Done", tone: "ok" },
  cancelled: { text: "Cancelled", tone: "mute" },
  no_show: { text: "Did not come", tone: "bad" },
};

export default async function BookingPage({ params }: { params: { id: string } }) {
  await checkPageAccess("/bookings");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.services}>
        <EmptyState title="Sign in to see this booking." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const b = await loadBooking(workspace.businessId, params.id).catch(() => null);
  if (!b) notFound();

  const st = STATE[b.status] ?? { text: b.status, tone: "mute" as Tone };
  // A deposit taken by a pay link is also a payment row; one recorded on the
  // booking alone is not. Count whichever is more, never both.
  const paid = Math.max(b.payments.reduce((n, p) => n + p.amount, 0), b.depositPaid);
  const depositOwed = Math.max(0, b.depositRequired - b.depositPaid);
  const balance = b.price !== null ? Math.max(0, b.price - paid) : null;
  const first = b.customer.name.split(/\s+/)[0];
  const ask =
    depositOwed > 0.005 && b.customer.phone && ["requested", "quoted", "confirmed"].includes(b.status)
      ? whatsappLink(
          b.customer.phone,
          `Hello ${first}, this is ${b.businessName}. To hold your ${b.service.name}${b.start ? ` on ${when(b.start)}` : ""}, please send the ${formatGHS(depositOwed)} deposit. Thank you.`
        )
      : null;

  return (
    <ModulePage identity={MODULES.services} title={b.service.name}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Link href={b.start ? `/bookings?day=${b.start.slice(0, 10)}` : "/bookings"} className={`${secondaryAction} min-h-[40px] self-start`}>
            <Icon name="back" size={15} />
            Back to the day
          </Link>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={b.customer.name} size={42} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <strong className="truncate font-heading text-[18px] text-ink-heading">{b.customer.name}</strong>
                  <span className="text-xs text-neutral-600">
                    {b.visitNumber === 1 ? "First visit" : `Visit ${b.visitNumber}`}
                    {b.customer.phone ? ` · ${localPhone(b.customer.phone)}` : ""}
                  </span>
                </span>
              </span>
              <StatusPill tone={st.tone}>{st.text}</StatusPill>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-panel bg-neutral-100 px-4 py-3 sm:grid-cols-4">
              <Fact label="When" value={b.start ? when(b.start) : "Not set"} sub={b.end ? `Until about ${clock(b.end)}` : undefined} />
              <Fact label="With" value={b.providerName ?? "Nobody yet"} />
              <Fact label="Where" value={b.serviceAddress ?? b.placeName ?? "Not set"} sub={b.serviceAddress ? "At their place" : undefined} />
              <Fact label="Price" value={b.price !== null ? formatGHS(b.price) : "Not set"} />
            </div>
            <span className="text-xs font-semibold text-neutral-600">How this booking is going</span>
            <Timeline entries={b.flow.map((f) => ({ id: f.id, title: f.title, detail: [when(f.at), f.detail].filter(Boolean).join(", "), tone: f.tone }))} />
          </Card>
          {b.notes && (
            <Card title={`Notes for ${b.providerName?.split(/\s+/)[0] ?? "whoever does it"}`}>
              <p className="text-[13.5px] text-ink">{b.notes}</p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Money">
            {b.depositRequired > 0 && (
              <Row k="Deposit" v={`${formatGHS(b.depositPaid)} of ${formatGHS(b.depositRequired)}`} />
            )}
            {b.payments.map((p) => (
              <Row key={p.id} k={`${p.method}, ${when(p.at)}`} v={formatGHS(p.amount)} />
            ))}
            {balance !== null && <Row k="Still to pay" v={formatGHS(balance)} strong />}
            {balance !== null && balance > 0.005 && ["confirmed", "in_progress", "completed"].includes(b.status) && (
              <RecordPayment source="service_booking" sourceId={b.id} left={balance} customerFirst={first} />
            )}
            {ask && (
              <a href={ask} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[40px] justify-center`}>
                <Icon name="send" size={15} />
                Ask {first} for the deposit on WhatsApp
              </a>
            )}
          </Card>
          <Card title="Change this booking">
            <BookingActions bookingId={b.id} status={b.status} providerId={b.providerId} team={b.team} />
            {!["requested", "quoted", "confirmed", "in_progress"].includes(b.status) && (
              <span className="text-[13px] text-neutral-600">
                {b.status === "cancelled" && b.cancellationReason ? `Cancelled: "${b.cancellationReason}".` : "This booking is finished."}
              </span>
            )}
          </Card>
          {b.crm && (
            <Card title={`${first} as a customer`}>
              <Row k="Spent with you" v={formatGHS(b.crm.spent)} />
              <Row k="Bookings" v={String(b.crm.bookings)} />
              {b.crm.owed > 0.005 && <Row k="Owes you" v={formatGHS(b.crm.owed)} />}
              <Link href={`/customers?q=${encodeURIComponent(b.customer.phone ?? b.customer.name)}`} className="text-[13px] font-semibold text-teal-dark underline">
                See {first} in Customers
              </Link>
            </Card>
          )}
        </div>
      </div>
    </ModulePage>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      {title && <h2 className="font-heading text-base font-bold text-ink-heading">{title}</h2>}
      {children}
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-neutral-600">{label}</span>
      <strong className="truncate text-[13.5px] text-ink">{value}</strong>
      {sub && <span className="truncate text-xs text-neutral-600">{sub}</span>}
    </span>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <span className="flex justify-between gap-3 text-[13px]">
      <span className="text-neutral-600">{k}</span>
      <span className={`num ${strong ? "font-bold text-ink" : "text-ink"}`}>{v}</span>
    </span>
  );
}
