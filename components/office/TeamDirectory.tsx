"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel, primaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

// The people who work here.
//
// The API behind this has existed since the POS staff work and has never
// had a screen: adding somebody was only possible from the till's PIN
// manager, which a merchant reaches only if they run a till at all.

export interface TeamRow {
  membershipId: string;
  name: string;
  phone: string | null;
  roleKey: string;
  status: string;
  isSelf: boolean;
}

// What the team screen can add someone as (add_team_member, 0077).
const ADDABLE_ROLES = ["cashier", "manager"];

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  accountant: "Accountant",
  staff: "Staff",
};

// What the role actually lets somebody do, in the merchant's terms rather
// than the permission table's.
const ROLE_MEANS: Record<string, string> = {
  owner: "Everything, including money and people",
  manager: "Runs the day, approves spending, adds people",
  cashier: "Sells at the till",
  accountant: "Reads the books, changes nothing",
  staff: "Their own work and hours",
};

export default function TeamDirectory({
  businessId,
  team,
  canManage,
}: {
  businessId: string;
  team: TeamRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // add_team_member (0077) accepts a cashier or a manager; offering more
  // here only produced a refusal after the owner filled the form in.
  const [roleKey, setRoleKey] = useState("cashier");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);

  async function changeRole(membershipId: string, key: string) {
    setBusy(membershipId);
    setError(null);
    try {
      const res = await fetch("/api/office/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_role", membershipId, roleKey: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not change that role. Tap again.");
        return;
      }
      setChanging(null);
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (fullName.trim().length < 2) {
      setError("Give this person a name.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/staff/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          fullName,
          phone: phone.trim() || null,
          roleKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not add them. Tap again.");
        return;
      }
      setAdding(false);
      setFullName("");
      setPhone("");
      setRoleKey("cashier");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(membershipId: string) {
    setBusy(membershipId);
    setError(null);
    try {
      const res = await fetch("/api/staff/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not remove them. Tap again.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3.5 rounded-panel bg-gold-100 px-4 py-3 text-sm font-semibold text-gold-700">
          {error}
        </p>
      )}

      {canManage && !adding && (
        <div className="mb-3.5 flex justify-end">
          <button onClick={() => setAdding(true)} className={primaryAction}>
            <Icon name="plus" size={16} />
            Add someone
          </button>
        </div>
      )}

      {adding && (
        <div className="mb-3.5 rounded-[18px] border border-line-brand bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Their name"
              aria-label="Name"
              className="w-full min-h-[44px] rounded-control border border-neutral-200 px-3 py-2.5 text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Their WhatsApp number, if they have one"
              aria-label="WhatsApp number"
              className="w-full min-h-[44px] rounded-control border border-neutral-200 px-3 py-2.5 text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
          </div>

          <div className="mt-3">
            <p className="text-[13px] font-bold text-ink">What they can do</p>
            <div className="mt-2 space-y-1.5">
              {ADDABLE_ROLES.map((key) => (
                <button
                  key={key}
                  onClick={() => setRoleKey(key)}
                  aria-pressed={roleKey === key}
                  className={`tap flex w-full flex-col items-start border px-3.5 py-2.5 text-left ${
                    roleKey === key
                      ? "border-teal bg-teal-light"
                      : "border-line bg-white"
                  }`}
                >
                  <span
                    className={`text-sm font-bold ${
                      roleKey === key ? "text-teal-dark" : "text-ink"
                    }`}
                  >
                    {ROLE_LABEL[key]}
                  </span>
                  <span className="text-[12.5px] font-medium text-slate-grey">
                    {ROLE_MEANS[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[12.5px] font-medium text-slate-grey">
            A cashier gets a PIN at the till rather than a password. Nobody
            here needs an account to be added.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={add}
              disabled={busy === "add"}
              className="tap flex items-center rounded-control bg-teal px-4 text-[13.5px] font-bold text-white hover:bg-teal-hover disabled:opacity-60"
            >
              {busy === "add" ? "Adding them to the team..." : "Add them to the team"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="tap flex items-center rounded-control border border-line-brand px-4 text-[13px] font-bold text-teal-800 hover:border-teal-brand"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {team.length === 0 ? (
        <EmptyState
          title="It is just you so far."
          detail="Add the people who work with you and their hours, sales and approvals start counting."
        />
      ) : (
        <Panel>
          <div
            aria-hidden
            className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${COLS}`}
          >
            <span>Person</span>
            <span>Role</span>
            <span>Phone</span>
            <span>Status</span>
            <span />
          </div>
          {team.map((m, i) => {
            const status = STATUS[m.status] ?? { text: m.status, cls: "bg-neutral-100 text-neutral-700" };
            const managed = canManage && !m.isSelf && m.roleKey !== "owner";
            return (
              <div key={m.membershipId} className={i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"}>
                <div className={`flex flex-wrap items-center gap-3 px-5 py-3 ${COLS}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-teal-50 text-[11.5px] font-bold text-teal-800"
                    >
                      {initials(m.name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-semibold text-ink">
                        {m.name}
                        {m.isSelf && <span className="ml-1.5 text-xs font-semibold text-neutral-500">you</span>}
                      </span>
                      <span className="truncate text-xs text-neutral-500 lg:hidden">
                        {ROLE_LABEL[m.roleKey] ?? m.roleKey}
                        {m.phone ? ` · ${local(m.phone)}` : ""}
                      </span>
                    </span>
                  </div>
                  <span className="hidden min-w-0 lg:block">
                    <span className="sr-only">Role: </span>
                    <span className="block text-[13.5px] font-semibold text-ink">{ROLE_LABEL[m.roleKey] ?? m.roleKey}</span>
                    <span className="block truncate text-xs text-neutral-500">{ROLE_MEANS[m.roleKey]}</span>
                  </span>
                  <span className="hidden truncate text-[13.5px] text-neutral-600 lg:block">
                    <span className="sr-only">Phone: </span>
                    {m.phone ? local(m.phone) : "None given"}
                  </span>
                  <span className="flex-none">
                    <span className="sr-only">Status: </span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${status.cls}`}>{status.text}</span>
                  </span>
                  <span className="flex flex-none flex-wrap justify-end gap-2 lg:justify-end">
                    {managed && changing !== m.membershipId && confirming !== m.membershipId && (
                      <>
                        <button
                          onClick={() => setChanging(m.membershipId)}
                          className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800 hover:border-teal-brand"
                        >
                          Change what they do
                        </button>
                        <button
                          onClick={() => setConfirming(m.membershipId)}
                          className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800 hover:border-teal-brand"
                        >
                          They have left
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {managed && changing === m.membershipId && (
                  <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                    {["staff", "cashier", "manager", "accountant"].map((key) => (
                      <button
                        key={key}
                        onClick={() => changeRole(m.membershipId, key)}
                        disabled={busy === m.membershipId || key === m.roleKey}
                        className={`tap flex items-center rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold disabled:opacity-60 ${
                          key === m.roleKey ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700 hover:border-teal-brand"
                        }`}
                      >
                        {busy === m.membershipId && key !== m.roleKey ? `Making them ${ROLE_LABEL[key].toLowerCase()}...` : ROLE_LABEL[key]}
                      </button>
                    ))}
                    <button onClick={() => setChanging(null)} className="tap flex items-center px-2 text-[13px] font-bold text-neutral-600">
                      Close
                    </button>
                  </div>
                )}

                {managed && confirming === m.membershipId && (
                  <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-3">
                    <span className="text-[13px] text-neutral-600">Remove {m.name.split(/\s+/)[0]} from the team? Their past work stays on record.</span>
                    <button
                      onClick={() => remove(m.membershipId)}
                      disabled={busy === m.membershipId}
                      className="tap flex items-center rounded-control bg-danger-tint px-3.5 text-[13px] font-bold text-danger-ink disabled:opacity-60"
                    >
                      {busy === m.membershipId ? "Removing them..." : "Yes, remove"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800"
                    >
                      Keep them
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters || name.slice(0, 1).toUpperCase();
}

// The design's team table, from 1024px: person, role, phone, status, actions.
const COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_230px_140px_110px_300px] lg:items-center lg:gap-4";

const STATUS: Record<string, { text: string; cls: string }> = {
  active: { text: "Active", cls: "bg-success-tint text-success-ink" },
  invited: { text: "Invited", cls: "bg-info-light text-info-ink" },
  suspended: { text: "Paused", cls: "bg-gold-100 text-gold-700" },
};

// +233 24 771 0932 reads as the number people say: 024 771 0932.
function local(e164: string): string {
  if (e164.startsWith("+233") && e164.length === 13) {
    const d = "0" + e164.slice(4);
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return e164;
}
