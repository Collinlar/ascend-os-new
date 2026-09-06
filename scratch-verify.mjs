// Does the reminder now fail only because the template is unapproved, and
// nothing else? Proved by sending one inside a customer's 24-hour window,
// where free text is legal and approval is not required.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_SERVICE_ROLE_KEY);
const err = (e) => (e ? String(e.message).split("\n")[0].slice(0, 95) : null);

const { data: biz } = await db.from("business")
  .insert({ name: "Verification Sandbox" }).select("id").single();
await db.from("balance_entry").insert({
  business_id: biz.id, kind: "top_up", amount: 50, currency_code: "GHS",
});

const overdueDate = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);

async function overdueInvoiceFor(phone, label) {
  const { data: c } = await db.from("customer")
    .insert({ business_id: biz.id, display_name: label, phone_e164: phone })
    .select("id").single();
  const { data: d } = await db.from("document").insert({
    business_id: biz.id, customer_id: c.id, type: "invoice", status: "draft",
    currency_code: "GHS", subtotal: 2400, tax_total: 0, total: 2400, due_date: overdueDate,
    lines: [{ description: "Rice", quantity: 6, unit_price: 400, line_total: 2400 }],
  }).select("id").single();
  await db.rpc("issue_document", { p: { document_id: d.id, channel: "business_web" } });
  return { customerId: c.id, documentId: d.id };
}

// One customer who has never written in, one who wrote an hour ago.
const cold = await overdueInvoiceFor("+233200000111", "Cold Customer");
const warm = await overdueInvoiceFor("+233200000222", "Warm Customer");
await db.from("whatsapp_session").insert({
  business_id: biz.id,
  customer_phone: "+233200000222",
  last_inbound_at: new Date(Date.now() - 3600e3).toISOString(),
  window_expires_at: new Date(Date.now() + 23 * 3600e3).toISOString(),
});

await db.rpc("mark_overdue_documents");
const run = await db.rpc("queue_payment_reminders", { p_limit: 20 });
console.log("queue_payment_reminders:", JSON.stringify(run.data), "\n");

const { data: msgs } = await db.from("message")
  .select("recipient, status, used_template, sent_in_session, rendered_body, failure_reason")
  .eq("business_id", biz.id).eq("channel", "whatsapp").order("recipient");

for (const m of msgs) {
  const who = m.recipient === "+233200000222" ? "wrote in an hour ago" : "never written in";
  console.log(`${m.recipient}  (${who})`);
  console.log(`  status:        ${m.status}${m.failure_reason ? " — " + m.failure_reason.slice(0, 70) : ""}`);
  console.log(`  in session:    ${m.sent_in_session}   uses template: ${m.used_template}`);
  console.log(`  body:          ${(m.rendered_body || "").slice(0, 95) || "(empty)"}`);
  console.log();
}

for (const t of ["ledger_entry", "evidence_record", "score_result", "document_reminder",
                 "message", "whatsapp_session", "balance_entry", "document_access_token",
                 "document_branding", "document", "document_sequence", "event_outbox",
                 "receivable", "entitlement", "customer", "location", "business_membership"]) {
  const r = await db.from(t).delete().eq("business_id", biz.id);
  if (r.error) console.log(`  cleanup ${t}: ${err(r.error)}`);
}
const gone = await db.from("business").delete().eq("id", biz.id);
console.log("sandbox removed:", gone.error ? "LEFT BEHIND " + err(gone.error) : "clean");
const docs = (await db.from("document").select("id", { count: "exact", head: true })).count;
console.log("real documents untouched:", docs);
