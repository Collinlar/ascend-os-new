"use client";

import { useState } from "react";
import { Panel } from "@/components/shell/Page";
import { CONTROL_LABEL, CONTROLS, STATE_LABEL, STATES } from "@/lib/risk/desk";
import { useDesk } from "./useDesk";

// The controls on a risk case (Risk and Trust R6). One thing open at a time,
// each with the written reason the database asks for. Suspending and
// terminating are requests a second admin confirms; the admin who asked
// sees that and cannot confirm their own.

export interface CaseView {
  caseId: string;
  businessName: string;
  status: "open" | "awaiting_confirmation" | "resolved";
  state: string;
  requested: { state: string; reason: string; by: string; byYou: boolean } | null;
  restrictions: string[];
  businessMessage: string | null;
  canAct: boolean;
}

type Tool = "state" | "pause" | "message" | "note" | "close";
const TOOLS: Array<[Tool, string]> = [
  ["state", "Change the state"],
  ["pause", "Pause or lift"],
  ["message", "What the business reads"],
  ["note", "Add a note"],
  ["close", "Close the case"],
];
const SHOWN = new Set(["restricted", "suspended", "terminated"]);

const area = "mt-1 w-full rounded-chip border border-line px-3 py-2 text-base text-ink";
const primary = "tap flex min-h-[44px] items-center rounded-chip bg-teal px-4 text-sm font-bold text-white disabled:opacity-60";
const quiet = "tap flex min-h-[44px] items-center rounded-chip border border-line px-4 text-sm font-bold text-ink-slate hover:bg-light-grey";

export default function RiskCaseDesk({ view }: { view: CaseView }) {
  const { busy, error, setError, post } = useDesk();
  const [tool, setTool] = useState<Tool | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<string>("");
  const [control, setControl] = useState<string>("");
  const [declining, setDeclining] = useState(false);

  const pick = (t: Tool | null) => {
    setTool(t);
    setText(t === "message" ? view.businessMessage ?? "" : "");
    setState("");
    setControl("");
    setError(null);
  };
  const done = async (key: string, body: Record<string, unknown>) => {
    const out = await post(key, { caseId: view.caseId, ...body });
    if (out) {
      pick(null);
      setDeclining(false);
    }
  };

  if (!view.canAct) {
    return <p className="text-sm font-medium text-slate-grey">Moderators can read cases. Only a BVM admin can act on them.</p>;
  }

  if (view.status === "resolved") {
    return (
      <Panel className="px-5 py-4">
        <p className="text-sm font-medium text-ink">This case is closed. To change anything on {view.businessName}, open a new case from the Risk page.</p>
      </Panel>
    );
  }

  const errorLine = error && (
    <p className="mt-2 rounded-panel bg-gold-light px-3 py-2 text-sm font-semibold text-gold-ink" role="alert">
      {error}
    </p>
  );

  // A suspension or termination waiting for a second admin blocks every other change.
  if (view.requested) {
    const r = view.requested;
    const verb = r.state === "terminated" ? "terminate" : "suspend";
    return (
      <Panel className="border-l-4 border-l-gold-rule px-5 py-4">
        <p className="text-[15px] font-bold text-ink">
          {r.byYou ? "You asked" : `${r.by[0].toUpperCase()}${r.by.slice(1)} asked`} to {verb} {view.businessName}.
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-ink">&ldquo;{r.reason}&rdquo;</p>
        {r.byYou ? (
          <p className="mt-2 text-sm font-medium text-slate-grey">
            Another admin confirms or declines it. Two people decide a {r.state === "terminated" ? "termination" : "suspension"}.
          </p>
        ) : declining ? (
          <>
            <label htmlFor="decline-why" className="mt-3 block text-sm font-semibold text-ink">
              Why not?
            </label>
            <textarea id="decline-why" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={area} placeholder="What the evidence does not show yet" />
            {errorLine}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={primary} disabled={busy === "decline"} onClick={() => done("decline", { action: "decline_state", reason: text })}>
                {busy === "decline" ? "Declining..." : `Decline, do not ${verb}`}
              </button>
              <button className={quiet} onClick={() => { setDeclining(false); setError(null); }}>
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-slate-grey">
              {r.state === "terminated"
                ? "Confirming closes the business on Ascend. It keeps read access to its records."
                : "Confirming stops the business selling, invoicing and changing anything. Customers cannot order or book. It can still read its records and appeal."}
            </p>
            {errorLine}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="tap flex min-h-[44px] items-center rounded-chip bg-danger-tint px-4 text-sm font-bold text-danger-ink disabled:opacity-60"
                disabled={busy === "confirm"}
                onClick={() => done("confirm", { action: "confirm_state" })}
              >
                {busy === "confirm" ? "Confirming..." : `Confirm, ${verb} ${view.businessName}`}
              </button>
              <button className={quiet} onClick={() => { setDeclining(true); setText(""); setError(null); }}>
                Decline it
              </button>
            </div>
          </>
        )}
      </Panel>
    );
  }

  return (
    <section aria-label="Act on this case">
      <div className="flex flex-wrap gap-2">
        {TOOLS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            aria-pressed={tool === t}
            onClick={() => pick(tool === t ? null : t)}
            className={`tap flex min-h-[44px] items-center rounded-chip border px-4 text-sm font-bold ${
              tool === t ? "border-teal bg-teal-light text-teal-dark" : "border-line text-ink-slate hover:bg-light-grey"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view.state === "restricted" && view.restrictions.length === 0 && (
        <p className="mt-3 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          Nothing is paused now, but the business still reads that it is restricted. Move it to monitor or normal.
        </p>
      )}

      {tool && (
        <Panel className="mt-3 px-5 py-4">
          {tool === "state" && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-ink">Move {view.businessName} to</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {STATES.filter((s) => s !== view.state).map((s) => (
                    <label
                      key={s}
                      className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-chip border px-3 py-2 ${
                        state === s ? "border-teal bg-teal-light" : "border-line"
                      }`}
                    >
                      <input type="radio" name="state" value={s} checked={state === s} onChange={() => setState(s)} className="mt-1 h-4 w-4 accent-teal" />
                      <span>
                        <span className="block text-sm font-bold text-ink">{STATE_LABEL[s].name}</span>
                        <span className="block text-xs font-medium text-slate-grey">{STATE_LABEL[s].means}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {view.restrictions.length > 0 && (state === "normal" || state === "monitor" || state === "review") && (
                <p className="mt-2 text-sm font-medium text-gold-ink">This lifts everything paused on the business.</p>
              )}
              <label htmlFor="state-why" className="mt-3 block text-sm font-semibold text-ink">
                Why
              </label>
              <textarea id="state-why" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={area} placeholder="What you found that justifies this" />
              {errorLine}
              <button
                className={`${primary} mt-3`}
                disabled={!state || busy === "state"}
                onClick={() => done("state", { action: "set_state", state, reason: text })}
              >
                {busy === "state"
                  ? "Saving..."
                  : !state
                    ? "Pick a state"
                    : state === "suspended" || state === "terminated"
                      ? `Ask a second admin to ${state === "suspended" ? "suspend" : "terminate"}`
                      : `Move to ${STATE_LABEL[state].name.toLowerCase()}`}
              </button>
            </>
          )}

          {tool === "pause" && (
            <>
              <fieldset>
                <legend className="text-sm font-semibold text-ink">What to pause or lift</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {CONTROLS.map((c) => {
                    const on = view.restrictions.includes(c);
                    return (
                      <label
                        key={c}
                        className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-chip border px-3 py-2 ${
                          control === c ? "border-teal bg-teal-light" : "border-line"
                        }`}
                      >
                        <input type="radio" name="control" value={c} checked={control === c} onChange={() => setControl(c)} className="h-4 w-4 accent-teal" />
                        <span className="text-sm font-bold text-ink">{CONTROL_LABEL[c]}</span>
                        <span className={`ml-auto text-xs font-bold ${on ? "text-danger-ink" : "text-slate-grey"}`}>{on ? "Paused" : "Working"}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {control && !view.restrictions.includes(control) && !SHOWN.has(view.state) && (
                <p className="mt-2 text-sm font-medium text-gold-ink">
                  Pausing anything moves the business to restricted. It then sees what is paused and can appeal.
                </p>
              )}
              <label htmlFor="pause-why" className="mt-3 block text-sm font-semibold text-ink">
                Why
              </label>
              <textarea id="pause-why" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={area} placeholder="For the case record. The business does not read this." />
              {errorLine}
              <button
                className={`${primary} mt-3`}
                disabled={!control || busy === "pause"}
                onClick={() =>
                  done("pause", {
                    action: view.restrictions.includes(control) ? "lift_restriction" : "set_restriction",
                    control,
                    reason: text,
                  })
                }
              >
                {busy === "pause"
                  ? "Saving..."
                  : !control
                    ? "Pick one"
                    : view.restrictions.includes(control)
                      ? `Lift: ${CONTROL_LABEL[control].toLowerCase()}`
                      : `Pause: ${CONTROL_LABEL[control].toLowerCase()}`}
              </button>
            </>
          )}

          {tool === "message" && (
            <>
              <label htmlFor="biz-message" className="block text-sm font-semibold text-ink">
                The line {view.businessName} reads as the reason
              </label>
              <p className="mt-0.5 text-xs font-medium text-slate-grey">
                {SHOWN.has(view.state)
                  ? "It shows on their dashboard and their standing page now."
                  : "They see it only if the business is restricted, suspended or terminated."}{" "}
                Leave it empty for the standard line for this kind of risk. Never name a customer.
              </p>
              <textarea id="biz-message" value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={3} className={area} placeholder="We need receipts for the refunds you gave on 12 and 13 November." />
              {errorLine}
              <button className={`${primary} mt-3`} disabled={busy === "message"} onClick={() => done("message", { action: "set_business_message", message: text })}>
                {busy === "message" ? "Saving..." : text.trim() ? "Save the line" : "Use the standard line"}
              </button>
            </>
          )}

          {tool === "note" && (
            <>
              <label htmlFor="case-note" className="block text-sm font-semibold text-ink">
                Note for the case
              </label>
              <textarea id="case-note" value={text} onChange={(e) => setText(e.target.value)} rows={3} className={area} placeholder="Called the owner. They are sending MoMo statements tomorrow." />
              {errorLine}
              <button className={`${primary} mt-3`} disabled={busy === "note"} onClick={() => done("note", { action: "add_note", note: text })}>
                {busy === "note" ? "Adding..." : "Add the note"}
              </button>
            </>
          )}

          {tool === "close" && (
            <>
              {SHOWN.has(view.state) && (
                <p className="mb-2 text-sm font-semibold text-gold-ink">
                  {view.businessName} stays {view.state} after this. To change that later, you would open a new case.
                </p>
              )}
              <label htmlFor="case-close" className="block text-sm font-semibold text-ink">
                How it ended
              </label>
              <textarea id="case-close" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={area} placeholder="Refunds were genuine. Nothing further." />
              {errorLine}
              <button className={`${primary} mt-3`} disabled={busy === "close"} onClick={() => done("close", { action: "resolve_case", resolution: text })}>
                {busy === "close" ? "Closing the case..." : "Close it now"}
              </button>
            </>
          )}
        </Panel>
      )}
    </section>
  );
}
