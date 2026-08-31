import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/nav/workspace";
import { supabaseServer } from "@/lib/supabase";
import { originFromRequest } from "@/lib/origin";
import { PageHeader, PageShell } from "@/components/shell/Page";
import BookingLink from "@/components/services/BookingLink";
import ServiceManager from "@/components/services/ServiceManager";
import type { ServiceRow } from "@/app/api/services/offerings/route";

export const dynamic = "force-dynamic";

// The Services set's own home.
//
// Everything a booking needs was already built except the two things that
// make one possible: somewhere to say what you offer, and somewhere to
// find the link. Availability without either is a business publishing the
// hours it is free for nothing.

interface State {
  slug: string | null;
  services: ServiceRow[];
  providers: Array<{ name: string; days: number }>;
  waiting: number;
}

async function load(businessId: string): Promise<State> {
  const db = supabaseServer();

  const [slugRow, items, availability, bookings] = await Promise.all([
    db.from("business").select("shop_slug").eq("id", businessId).maybeSingle(),
    db
      .from("catalogue_item")
      .select("id, name, description, base_price, active, service_attributes")
      .eq("business_id", businessId)
      .eq("kind", "service")
      .order("name"),
    db
      .from("staff_availability")
      .select("membership_id, day_of_week, membership:membership_id(person:person_id(full_name))")
      .eq("business_id", businessId),
    db
      .from("service_booking")
      .select("status")
      .eq("business_id", businessId)
      .in("status", ["requested", "quoted"]),
  ]);

  // Who can actually be booked, and how much of the week they cover. A
  // provider with no published hours is not offerable (SRV-004).
  const byProvider = new Map<string, { name: string; days: Set<number> }>();
  for (const row of availability.data ?? []) {
    const id = row.membership_id as string;
    const name =
      ((row.membership as unknown as { person: { full_name: string } | null } | null)
        ?.person?.full_name) ?? "Someone on your team";
    if (!byProvider.has(id)) byProvider.set(id, { name, days: new Set() });
    byProvider.get(id)!.days.add(Number(row.day_of_week));
  }

  return {
    slug: (slugRow.data?.shop_slug as string | null) ?? null,
    services: (items.data ?? []).map((item) => {
      const attrs = (item.service_attributes ?? {}) as Record<string, unknown>;
      return {
        id: item.id as string,
        name: item.name as string,
        description: (item.description as string | null) ?? null,
        price: item.base_price === null ? null : Number(item.base_price),
        durationMinutes: Number(attrs.duration_minutes ?? 60),
        bufferMinutes: Number(attrs.buffer_minutes ?? 0),
        depositAmount: attrs.deposit_amount ? Number(attrs.deposit_amount) : null,
        active: Boolean(item.active),
      };
    }),
    providers: Array.from(byProvider.values()).map((p) => ({
      name: p.name,
      days: p.days.size,
    })),
    waiting: (bookings.data ?? []).length,
  };
}

export default async function ServicesHome() {
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) redirect("/onboarding");

  // Not a paywall. A business without Services is sent to the room where
  // taking it on is explained, rather than shown a door that does nothing.
  if (!workspace.capabilities.has("services.bookings")) redirect("/grow");

  const state = await load(workspace.businessId).catch(
    (): State => ({ slug: null, services: [], providers: [], waiting: 0 })
  );

  const url = state.slug ? `${originFromRequest()}/b/${state.slug}` : null;
  const bookable = state.services.filter((s) => s.active).length;
  const ready = bookable > 0 && state.providers.length > 0;

  return (
    <PageShell>
      <PageHeader
        title="Your bookings setup"
        intro="What you offer, who can do it, and the link that lets somebody take a time."
      />

      <div className="flex flex-col gap-6">
        {/* The two things a booking needs, said before anything else, so a
            business is never quietly unbookable. */}
        {!ready && (
          <div className="rounded-[18px] border border-l-4 border-line-soft border-l-gold-rule bg-white px-[22px] py-5 shadow-card">
            <p className="text-[15px] font-bold text-ink">
              Nobody can book you yet.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {bookable === 0 && (
                <li className="text-sm font-medium text-ink-muted">
                  Nothing is listed to book. Add a service below.
                </li>
              )}
              {state.providers.length === 0 && (
                <li className="text-sm font-medium text-ink-muted">
                  Nobody has published hours yet.{" "}
                  <Link href="/availability" className="font-bold text-teal-dark underline">
                    Set your normal week
                  </Link>
                  .
                </li>
              )}
            </ul>
          </div>
        )}

        <BookingLink
          url={url}
          businessName={workspace.businessName}
          bookable={bookable}
        />

        <section className="grid gap-3.5 sm:grid-cols-3">
          <Card
            label="Waiting on you"
            value={String(state.waiting)}
            note={
              state.waiting === 0
                ? "No requests to answer"
                : "Bookings nobody has confirmed"
            }
            tone={state.waiting > 0 ? "gold" : "plain"}
          />
          <Card
            label="Bookable"
            value={String(bookable)}
            note={
              bookable === 0
                ? "Nothing customers can pick"
                : `${bookable === 1 ? "Service" : "Services"} on your page`
            }
          />
          <Card
            label="Who can be booked"
            value={String(state.providers.length)}
            note={
              state.providers.length === 0
                ? "No published hours yet"
                : state.providers
                    .map((p) => `${p.name.split(" ")[0]} (${p.days}d)`)
                    .join(", ")
            }
          />
        </section>

        <ServiceManager businessId={workspace.businessId} services={state.services} />

        <div className="flex flex-wrap gap-3">
          <Link
            href="/availability"
            className="tap flex flex-1 items-center justify-between rounded-panel border border-line-soft bg-white px-[18px] py-4 shadow-card"
          >
            <span className="text-sm font-bold text-ink">When you are free</span>
            <span className="text-sm font-bold text-teal-dark">Set your hours</span>
          </Link>
          <Link
            href="/bookings"
            className="tap flex flex-1 items-center justify-between rounded-panel border border-line-soft bg-white px-[18px] py-4 shadow-card"
          >
            <span className="text-sm font-bold text-ink">Every booking</span>
            <span className="text-sm font-bold text-teal-dark">Open the diary</span>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function Card({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "plain" | "gold";
}) {
  return (
    <div
      className={`rounded-panel border bg-white px-[22px] py-5 shadow-card ${
        tone === "gold" ? "border-l-4 border-line-soft border-l-gold-rule" : "border-line-soft"
      }`}
    >
      <p className="text-[12.5px] font-semibold text-slate-grey">{label}</p>
      <p className="num mt-1.5 text-3xl font-extrabold tracking-[-0.025em] text-ink">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-grey">{note}</p>
    </div>
  );
}
