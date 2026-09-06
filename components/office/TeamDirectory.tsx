"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel, PanelRow } from "@/components/shell/Page";

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
  const [roleKey, setRoleKey] = useState("staff");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

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
      setRoleKey("staff");
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
        <p className="mb-3.5 border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}

      {canManage && !adding && (
        <div className="mb-3.5 flex justify-end">
          <button
            onClick={() => setAdding(true)}
            className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover"
          >
            Add someone
          </button>
        </div>
      )}

      {adding && (
        <div className="mb-3.5 rounded-[18px] border border-line-soft bg-white p-5 shadow-lift">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Their name"
              aria-label="Name"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Their WhatsApp number, if they have one"
              aria-label="WhatsApp number"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
          </div>

          <div className="mt-3">
            <p className="text-[13px] font-bold text-ink">What they can do</p>
            <div className="mt-2 space-y-1.5">
              {["staff", "cashier", "manager", "accountant"].map((key) => (
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
              className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover disabled:opacity-60"
            >
              {busy === "add" ? "Adding..." : "Add them to the team"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
            >
              Cancel
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
          {team.map((m, i) => (
            <PanelRow key={m.membershipId} last={i === team.length - 1}>
              <span
                aria-hidden
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-light-grey text-sm font-extrabold text-ink-slate"
              >
                {initials(m.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold leading-snug text-ink">
                  {m.name}
                  {m.isSelf && (
                    <span className="ml-2 text-[12px] font-bold text-slate-grey">
                      you
                    </span>
                  )}
                </p>
                <p className="text-[12.5px] font-medium text-slate-grey">
                  {ROLE_LABEL[m.roleKey] ?? m.roleKey}
                  {m.phone && ` · ${m.phone}`}
                  {m.status !== "active" && ` · ${m.status}`}
                </p>
              </div>

              {canManage && !m.isSelf && m.roleKey !== "owner" && (
                confirming === m.membershipId ? (
                  <span className="flex flex-none gap-2">
                    <button
                      onClick={() => remove(m.membershipId)}
                      disabled={busy === m.membershipId}
                      className="tap flex items-center rounded-chip bg-danger-tint px-3.5 text-[13px] font-bold text-danger-ink disabled:opacity-60"
                    >
                      {busy === m.membershipId ? "Removing..." : "Yes, remove"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="tap flex items-center rounded-chip border border-line px-3.5 text-[13px] font-bold text-ink-slate"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirming(m.membershipId)}
                    className="tap flex flex-none items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
                  >
                    They have left
                  </button>
                )
              )}
            </PanelRow>
          ))}
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
