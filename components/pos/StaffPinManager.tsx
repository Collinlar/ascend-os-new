"use client";

import { useState } from "react";
import { EmptyState } from "@/components/shell/Page";
import { derivePin } from "@/lib/pos/staff";

// Who can open a till, and with which four digits.
//
// The PIN is turned into a hash here, in the browser, and only the hash
// leaves. Nobody at AscendSME can read a merchant's till PINs, including
// from a database backup.

export interface StaffRow {
  membershipId: string;
  displayName: string;
  roleKey: string;
  hasPin: boolean;
}

const ROLES: Array<{ key: "cashier" | "manager"; label: string; detail: string }> = [
  { key: "cashier", label: "Cashier", detail: "Sells at the till" },
  {
    key: "manager",
    label: "Manager",
    detail: "Sells, and approves refunds and discounts",
  },
];

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function StaffPinManager({
  businessId,
  staff,
}: {
  businessId: string;
  staff: StaffRow[];
}) {
  const [rows, setRows] = useState(staff);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"cashier" | "manager">("cashier");
  const [newPin, setNewPin] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function savePin(membershipId: string) {
    if (!/^\d{4}$/.test(pin)) {
      setError("A till PIN is 4 digits.");
      return;
    }
    // Four identical or sequential digits are the ones a cashier standing
    // behind someone guesses first.
    if (/^(\d)\1{3}$/.test(pin) || "0123456789".includes(pin)) {
      setError("Pick something harder to guess than that.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const pinSalt = randomSalt();
      const pinHash = await derivePin(pin, pinSalt);
      const res = await fetch("/api/staff/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId, pinHash, pinSalt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save that PIN. Tap again.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.membershipId === membershipId ? { ...r, hasPin: true } : r))
      );
      setDone(membershipId);
      setEditing(null);
      setPin("");
    } catch {
      setError("We could not reach the network. Tap save again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function addPerson() {
    if (newName.trim().length < 2) {
      setError("Give this person a name so receipts can say who served.");
      return;
    }
    if (newPin && !/^\d{4}$/.test(newPin)) {
      setError("A till PIN is 4 digits, or leave it empty for now.");
      return;
    }
    if (newPin && (/^(\d){3}$/.test(newPin) || "0123456789".includes(newPin))) {
      setError("Pick something harder to guess than that.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // The PIN is hashed here, so adding somebody never sends their digits.
      let pinHash: string | undefined;
      let pinSalt: string | undefined;
      if (newPin) {
        pinSalt = randomSalt();
        pinHash = await derivePin(newPin, pinSalt);
      }

      const res = await fetch("/api/staff/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          fullName: newName.trim(),
          roleKey: newRole,
          pinHash,
          pinSalt,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not add them. Tap again.");
        return;
      }

      setRows((prev) => [
        ...prev,
        {
          membershipId: data.membershipId,
          displayName: newName.trim(),
          roleKey: newRole,
          hasPin: Boolean(newPin),
        },
      ]);
      setAdding(false);
      setNewName("");
      setNewPin("");
      setNewRole("cashier");
    } catch {
      setError("We could not reach the network. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function removePerson(membershipId: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "We could not remove them. Tap again.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.membershipId !== membershipId));
      setDone(null);
      setError(null);
      setNote(`${name} can no longer open a till. Their past sales still show their name.`);
    } catch {
      setError("We could not reach the network. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function removePin(membershipId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/pin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "We could not remove that PIN. Tap again.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.membershipId === membershipId ? { ...r, hasPin: false } : r))
      );
    } catch {
      setError("We could not reach the network. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink">
        Who can open a till
      </h2>
      <p className="mt-1 max-w-2xl text-sm font-medium text-slate-grey">
        Each person types their own 4 digits to start selling, and their name
        goes on every receipt they serve. A till will not open until at least
        one person here has a PIN.
      </p>

      {error && (
        <p className="mt-3 rounded-panel bg-gold-light px-4 py-3 text-sm text-gold-dark">
          {error}
        </p>
      )}
      {note && (
        <p className="mt-3 rounded-panel bg-teal-light px-4 py-3 text-sm text-teal-dark">
          {note}
        </p>
      )}

      {adding ? (
        <div className="mt-4 space-y-3 rounded-panel bg-white p-4">
          <div>
            <label className="text-xs text-ink-muted">Their name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="The name customers see on the receipt"
              className="mt-1 w-full rounded-control border border-line px-3 py-2 focus:border-teal focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-ink-muted">What they do</label>
            <div className="mt-1 space-y-2">
              {ROLES.map((role) => (
                <label
                  key={role.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2 ${
                    newRole === role.key ? "border-teal bg-teal-light" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    checked={newRole === role.key}
                    onChange={() => setNewRole(role.key)}
                    className="mt-1 h-4 w-4 shrink-0 accent-teal"
                  />
                  <span className="text-sm text-ink">
                    {role.label}
                    <span className="block text-xs text-ink-muted">{role.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-muted">Their 4 digit PIN</label>
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              type="password"
              placeholder="You can set this later"
              className="num mt-1 w-40 rounded-control border border-line px-3 py-2 tracking-[0.4em] focus:border-teal focus:outline-none"
            />
          </div>

          <p className="text-xs text-ink-muted">
            They do not need an account or a phone. The PIN is all they use.
          </p>

          <div className="flex gap-2">
            <button
              onClick={addPerson}
              disabled={busy}
              className="tap rounded-control bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Adding..." : "Add them"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewPin("");
                setError(null);
              }}
              className="tap rounded-control px-3 py-2 text-sm font-medium text-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setAdding(true);
            setError(null);
            setNote(null);
          }}
          className="tap mt-4 flex items-center rounded-[13px] border border-teal-pale bg-teal-light px-[22px] text-[13.5px] font-bold text-teal-dark hover:bg-teal-pale"
        >
          Add someone to the team
        </button>
      )}

      <div className="mt-4">
        {rows.length === 0 && (
          <EmptyState
            title="Only you so far."
            detail="Everything sold says your name until you add the people who actually serve."
          />
        )}

        {rows.map((person) => (
          <div
            key={person.membershipId}
            className="mb-2.5 rounded-[15px] border border-line-soft bg-white px-[18px] py-3.5 shadow-card"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-bold text-ink">
                  {person.displayName}
                </p>
                <p className="text-xs font-medium capitalize text-slate-grey">
                  {person.roleKey}
                  {person.hasPin ? " · can open a till" : " · no PIN yet"}
                </p>
              </div>

              {editing === person.membershipId ? null : (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setEditing(person.membershipId);
                      setPin("");
                      setError(null);
                      setDone(null);
                    }}
                    className="tap flex items-center rounded-chip bg-teal-light px-4 text-[13px] font-bold text-teal-dark hover:bg-teal-pale"
                  >
                    {person.hasPin ? "Change PIN" : "Give a PIN"}
                  </button>
                  {person.roleKey !== "owner" && (
                    <button
                      onClick={() => removePerson(person.membershipId, person.displayName)}
                      disabled={busy}
                      className="tap rounded-control px-3 py-2 text-sm font-medium text-ink-muted"
                    >
                      They left
                    </button>
                  )}
                </div>
              )}
            </div>

            {editing === person.membershipId && (
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  type="password"
                  placeholder="4 digits"
                  aria-label={`Till PIN for ${person.displayName}`}
                  className="num w-32 rounded-control border border-line px-4 py-2 tracking-[0.4em] focus:border-teal focus:outline-none"
                />
                <button
                  onClick={() => savePin(person.membershipId)}
                  disabled={busy}
                  className="tap rounded-control bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Save this PIN"}
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setPin("");
                    setError(null);
                  }}
                  className="tap rounded-control px-3 py-2 text-sm font-medium text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            )}

            {done === person.membershipId && (
              <p className="mt-2 text-sm text-teal-dark">
                Saved. Tell them their PIN yourself, it is not shown again.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        A till PIN says who is at the counter. It is not the pairing code: a
        till is set up once with the code above, then each person signs in
        with their own PIN. It is not an account password either, and it does
        not open anything on this dashboard.
      </p>
    </section>
  );
}
