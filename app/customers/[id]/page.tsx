import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { Avatar, StatusPill } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import { ConsentSwitch, History } from "@/components/customers/ProfileParts";
import { MODULES } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { currentWorkspace } from "@/lib/nav/workspace";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";
import { loadCustomerProfile } from "@/lib/customers/profile";

export const dynamic = "force-dynamic";

// One customer (Modules M5): one record however they bought. Who they are,
// what they have spent and still owe, how often they come, whether they
// agreed to offers, and one history across everything Ascend runs.

const VIA: Record<string, string> = {
  pos: "Met at the counter",
  shop: "Ordered online",
  services: "Booked a service",
  documents: "Sent a document",
  import: "Imported",
  manual: "Added by hand",
};

// Where the agreement was captured (consent_record.source, 0066).
const SOURCE: Record<string, string> = {
  merchant_recorded: "recorded by the business",
  shop_link: "when they ordered from your shop",
  backfilled_from_flag: "carried over from before consent records were kept",
  flag_set_directly: "recorded by the business",
};

const localPhone = (e164: string) =>
  e164.startsWith("+233") && e164.length === 13 ? `0${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : e164;
const longDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "long", year: "numeric" });

function gapText(days: number | null): string {
  if (days === null) return "Not yet";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export default async function CustomerProfilePage({ params }: { params: { id: string } }) {
  await checkPageAccess("/customers");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.customers}>
        <EmptyState title="Sign in to see this customer." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [c, canChange] = await Promise.all([
    loadCustomerProfile(workspace.businessId, params.id).catch(() => null),
    (async () => {
      const personId = await currentPersonId();
      const { data: m } = await supabaseServer()
        .from("business_membership")
        .select("id")
        .eq("person_id", personId ?? "")
        .eq("business_id", workspace.businessId)
        .eq("status", "active")
        .maybeSingle();
      if (!m) return false;
      const { data } = await supabaseServer().rpc("membership_authority", { p_membership: m.id });
      return ((data as { permissions?: string[] } | null)?.permissions ?? []).includes("customers.manage");
    })().catch(() => false),
  ]);
  if (!c) notFound();

  const first = c.name.split(/\s+/)[0];
  const caps = workspace.capabilities;
  const wa = c.phone ? `https://wa.me/${c.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello ${first}, this is ${c.businessName}. `)}` : null;

  return (
    <ModulePage identity={MODULES.customers} title={c.name}>
      <div className="flex flex-col gap-4">
        <Link href="/customers" className={`${secondaryAction} min-h-[40px] self-start`}>
          <Icon name="back" size={15} />
          All customers
        </Link>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Card>
              <span className="flex items-center gap-3">
                <Avatar name={c.name} size={44} />
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate font-heading text-[18px] text-ink-heading">{c.name}</strong>
                  <span className="text-xs text-neutral-600">Customer since {longDay(c.createdAt)}</span>
                </span>
              </span>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <Row k="Phone" v={c.phone ? localPhone(c.phone) : "None given"} />
                <Row k="Email" v={c.email ?? "None given"} />
                <Row k="First came" v={VIA[c.createdVia] ?? "Added by hand"} />
                {c.figures.lastSeen && <Row k="Last seen" v={longDay(c.figures.lastSeen)} />}
              </div>
              <div className="flex flex-wrap gap-2">
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className={`${primaryAction} min-h-[40px]`}>
                    <Icon name="send" size={15} />
                    WhatsApp {first}
                  </a>
                )}
                {caps.has("documents.issue") && (
                  <Link href="/documents?new=invoice" className={`${secondaryAction} min-h-[40px]`}>
                    New invoice
                  </Link>
                )}
              </div>
            </Card>
            <Card title="Offers and messages">
              <span className="flex items-center justify-between text-[13px]">
                <span className="text-ink">Messages about their own orders</span>
                <StatusPill tone="ok">Always</StatusPill>
              </span>
              <span className="flex items-center justify-between text-[13px]">
                <span className="text-ink">Offers from you</span>
                <StatusPill tone={c.marketingConsent ? "ok" : "mute"}>{c.marketingConsent ? "Agreed" : "Not agreed"}</StatusPill>
              </span>
              <span className="text-xs leading-relaxed text-neutral-600">
                {c.consent?.withdrawnAt
                  ? `Opted out on ${longDay(c.consent.withdrawnAt)}.`
                  : c.consent?.grantedAt
                    ? `Agreed on ${longDay(c.consent.grantedAt)}${c.consent.source && SOURCE[c.consent.source] ? `, ${SOURCE[c.consent.source]}` : ""}.`
                    : "Nothing recorded. Ascend sends them nothing but their own orders, receipts and reminders."}
              </span>
              <ConsentSwitch customerId={c.id} agreed={c.marketingConsent} canChange={canChange} />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label="Spent with you" value={formatGHS(c.figures.spent)} />
              <Figure label="Visits" value={String(c.figures.visits)} />
              <Figure label="Usually comes back every" value={gapText(c.figures.averageGapDays)} />
              <Figure label="Owes you" value={formatGHS(c.figures.owed)} warn={c.figures.owed > 0.005} />
            </div>
            <History entries={c.history} />
          </div>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between gap-3">
      <span className="text-neutral-600">{k}</span>
      <strong className="min-w-0 truncate text-right text-ink">{v}</strong>
    </span>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
      <span className="text-[12.5px] text-neutral-600">{label}</span>
      <span className={`num font-heading text-[20px] font-extrabold ${warn ? "text-gold-700" : "text-ink-heading"}`}>{value}</span>
    </div>
  );
}
