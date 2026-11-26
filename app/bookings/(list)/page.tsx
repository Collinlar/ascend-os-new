import { ModulePage } from "@/components/shell/Module";
import { MODULES, currentCapabilities, servicesTabs } from "@/lib/nav/modules";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import BookingList, {
  type OwnerBooking,
  type ProviderOption,
} from "@/components/services/BookingList";
import Link from "next/link";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { StatusPill, Tag } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import DaySchedule, { Legend } from "@/components/services/DaySchedule";
import { loadServicesDay } from "@/lib/services/day";
import { currentWorkspace } from "@/lib/nav/workspace";
import { formatGHS } from "@/lib/money";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Services, Bookings (Modules M4). The day, person by person, coloured by
// where each booking stands, and beside it what needs an answer and what is
// still to be paid. "All bookings" keeps the full list with its week view.

async function load(): Promise<{
  bookings: OwnerBooking[];
  providers: ProviderOption[];
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    // Who a booking can be handed to. A solo provider gets an empty list
    // and no picker: assignment is a question with one answer.
    const providersQuery = db
      .from("business_membership")
      .select("id, person:person_id(full_name)")
      .eq("business_id", membership.business_id)
      .eq("status", "active")
      .limit(50);

    const { data } = await db
      .from("service_booking")
      .select(
        "id, status, model, scheduled_start, scheduled_end, price_quoted, service_address, staff_notes, customer:customer_id(display_name, phone_e164), item:item_id(name), provider:assigned_membership_id(person:person_id(full_name))"
      )
      .eq("business_id", membership.business_id)
      .order("scheduled_start", { ascending: true, nullsFirst: false })
      .limit(50);

    const providers = await providersQuery;

    const bookings = (data ?? []).map((b) => {
      const customer = b.customer as unknown as {
        display_name: string;
        phone_e164: string | null;
      } | null;
      return {
        id: b.id,
        status: b.status,
        model: b.model,
        scheduledStart: b.scheduled_start,
        scheduledEnd: b.scheduled_end,
        providerName:
          ((b.provider as unknown as { person: { full_name: string } | null } | null)
            ?.person?.full_name) ?? null,
        price: b.price_quoted === null ? null : Number(b.price_quoted),
        serviceAddress: b.service_address,
        // Staff notes stay server-side and owner-only; they are never sent
        // to a customer surface (SRV-013).
        hasNotes: Boolean(b.staff_notes),
        customerName: customer?.display_name ?? "Customer",
        customerPhone: customer?.phone_e164 ?? null,
        serviceName:
          (b.item as unknown as { name: string } | null)?.name ?? "Service",
      };
    });

    return {
      bookings,
      providers: (providers.data ?? []).map((m) => ({
        membershipId: m.id,
        name:
          (m.person as unknown as { full_name: string } | null)?.full_name ??
          "A team member",
      })),
    };
  } catch {
    return null;
  }
}

const ACCRA_DAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const shift = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Bookings({ searchParams }: { searchParams: { day?: string; view?: string } }) {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/bookings");

  const today = ACCRA_DAY();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? (searchParams.day as string) : today;
  const view = searchParams.view === "list" ? "list" : "day";
  const workspace = await currentWorkspace().catch(() => null);
  const tabs = servicesTabs(await currentCapabilities(), "/bookings");

  if (!workspace) {
    return (
      <ModulePage identity={MODULES.services} tabs={tabs}>
        <EmptyState title="Sign in to see your schedule." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }

  const [data, dayData] = await Promise.all([
    view === "list" ? load() : Promise.resolve(null),
    view === "day" ? loadServicesDay(workspace.businessId, day).catch(() => null) : Promise.resolve(null),
  ]);
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const chip = (on: boolean) =>
    `tap flex min-h-[40px] items-center whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${
      on ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
    }`;

  return (
    <ModulePage identity={MODULES.services} tabs={tabs}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {view === "day" ? (
            <div className="flex items-center gap-2">
              <Link href={`/bookings?day=${shift(day, -1)}`} aria-label="The day before" className={`${secondaryAction} min-h-[40px] px-3`}>
                <Icon name="back" size={16} />
              </Link>
              <strong className="min-w-0 truncate font-heading text-[17px] text-ink-heading">{day === today ? `Today, ${label}` : label}</strong>
              <Link href={`/bookings?day=${shift(day, 1)}`} aria-label="The day after" className={`${secondaryAction} min-h-[40px] px-3`}>
                <Icon name="chev" size={16} />
              </Link>
              {day !== today && (
                <Link href="/bookings" className={chip(false)}>
                  Today
                </Link>
              )}
            </div>
          ) : (
            <strong className="font-heading text-[17px] text-ink-heading">Every booking</strong>
          )}
          <div className="flex gap-1.5">
            <Link href={day === today ? "/bookings" : `/bookings?day=${day}`} className={chip(view === "day")} aria-current={view === "day" ? "page" : undefined}>
              Day
            </Link>
            <Link href="/bookings?view=list" className={chip(view === "list")} aria-current={view === "list" ? "page" : undefined}>
              All bookings
            </Link>
          </div>
        </div>

        {view === "list" ? (
          data === null ? (
            <EmptyState title="We could not load your bookings just now." detail="Refresh in a moment. Nothing has changed." />
          ) : data.bookings.length === 0 ? (
            <EmptyState title="Nothing booked yet." detail="Share your booking link on WhatsApp and your first request will land here." />
          ) : (
            <BookingList bookings={data.bookings} providers={data.providers} />
          )
        ) : dayData === null ? (
          <EmptyState title="We could not load this day just now." detail="Refresh in a moment. Nothing has changed." />
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-3">
              <DaySchedule columns={dayData.columns} day={day} />
              <Legend />
            </div>
            <div className="flex flex-col gap-4">
              <section className="grid grid-cols-2 gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                <Fig label={day === today ? "Bookings today" : "Bookings this day"} value={String(dayData.figures.bookings)} />
                <Fig label="Deposits in" value={formatGHS(dayData.figures.depositsIn)} />
                <Fig label="Booked value" value={formatGHS(dayData.figures.bookedValue)} />
                <Fig label="No-shows" value={String(dayData.figures.noShows)} bad={dayData.figures.noShows > 0} />
              </section>

              <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-base font-bold text-ink-heading">Requests to answer</h2>
                  {dayData.requests.length > 0 && <StatusPill tone="warn">{String(dayData.requests.length)}</StatusPill>}
                </div>
                {dayData.requests.length === 0 ? (
                  <p className="text-sm text-neutral-600">Nobody is waiting for an answer.</p>
                ) : (
                  dayData.requests.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex flex-col gap-1 border-t border-neutral-100 pt-2.5 first:border-t-0 first:pt-0">
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-[13.5px] text-ink">{r.customer}</strong>
                        <Tag>{r.status === "quoted" ? "Quoted, waiting" : "Wants to book"}</Tag>
                      </span>
                      <span className="text-xs text-neutral-600">
                        {r.service}
                        {r.start ? `, ${when(r.start)}` : ""}
                        {r.address ? `, ${r.address}` : ""}
                      </span>
                      <Link href={`/bookings/${r.id}`} className={`${primaryAction} mt-1 min-h-[40px] self-start`}>
                        Answer {r.customer.split(/\s+/)[0]}
                      </Link>
                    </div>
                  ))
                )}
              </section>

              {dayData.deposits.length > 0 && (
                <section className="flex flex-col gap-2.5 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                  <h2 className="font-heading text-base font-bold text-ink-heading">Waiting on deposits</h2>
                  {dayData.deposits.slice(0, 6).map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <Link href={`/bookings/${d.id}`} className="min-w-0 truncate text-ink hover:underline">
                        {d.customer} · {new Date(d.start).toISOString().slice(0, 10) === day ? clock(d.start) : when(d.start)}
                      </Link>
                      <strong className="num flex-none">{formatGHS(d.owed)}</strong>
                    </div>
                  ))}
                  {dayData.deposits.some((d) => d.phone) && (
                    <span className="text-xs leading-relaxed text-neutral-600">
                      Ask for a deposit from your own WhatsApp on the booking. Pay links come with online payments.
                    </span>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </ModulePage>
  );
}

function Fig({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-neutral-600">{label}</span>
      <strong className={`num truncate font-heading text-[18px] ${bad ? "text-danger-ink" : "text-ink-heading"}`}>{value}</strong>
    </span>
  );
}
