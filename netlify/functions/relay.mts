// The relay tick, on Netlify.
//
// vercel.json has scheduled /api/internal/relay every five minutes since the
// worker was written. The site is deployed on Netlify, which does not read
// vercel.json, so that schedule has never once fired in production.
//
// Four jobs ride this worker, and none of them have been running:
//
//   the outbox drains into the evidence engine, which is what a
//   Sustainability Score is built from
//   readiness is recomputed for whichever businesses actually moved
//   queued WhatsApp messages go out
//   abandoned deposit holds give a provider's slot back
//
// It calls the existing route rather than importing the worker, because the
// route already carries the auth check and the batch size, and a second copy
// of that logic in a different runtime is how the two drift apart.
//
// CRON_SECRET must be set in the Netlify environment. Without it the route
// answers 401 and this tick does nothing, which is the safe direction to
// fail but a silent one, so it is logged loudly.

const BATCH_LIMIT = 6; // batches per tick, not events
const TIME_BUDGET_MS = 8000; // leave room inside Netlify's function timeout

export default async () => {
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;

  if (!base) {
    console.error("relay: no site URL in the environment, nothing to call");
    return new Response("no site url", { status: 500 });
  }
  if (!secret) {
    console.error(
      "relay: CRON_SECRET is not set, so the relay route will refuse this call. " +
        "Evidence, scores, messages and expired holds are all stalled until it is."
    );
    return new Response("no cron secret", { status: 500 });
  }

  const started = Date.now();
  const totals = { batches: 0, dispatched: 0, failed: 0, messagesSent: 0 };

  // Keep pulling while batches come back full: a backlog should clear on the
  // next tick or two rather than trickling out fifty at a time for an hour.
  for (let i = 0; i < BATCH_LIMIT; i += 1) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    let result: {
      claimed?: number;
      dispatched?: number;
      failed?: number;
      messagesSent?: number;
      error?: string;
    };

    try {
      const response = await fetch(`${base}/api/internal/relay`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      result = await response.json();

      if (!response.ok) {
        console.error(`relay: route answered ${response.status}`, result);
        return new Response(`relay failed: ${response.status}`, { status: 502 });
      }
    } catch (err) {
      console.error("relay: could not reach the route", err);
      return new Response("relay unreachable", { status: 502 });
    }

    totals.batches += 1;
    totals.dispatched += result.dispatched ?? 0;
    totals.failed += result.failed ?? 0;
    totals.messagesSent += result.messagesSent ?? 0;

    // A short batch means the outbox is empty; stop rather than spin.
    if ((result.claimed ?? 0) < 50) break;
  }

  console.log(
    `relay: ${totals.dispatched} events dispatched, ${totals.failed} failed, ` +
      `${totals.messagesSent} messages sent, over ${totals.batches} batch(es)`
  );

  return new Response(JSON.stringify(totals), {
    headers: { "content-type": "application/json" },
  });
};

export const config = {
  schedule: "*/5 * * * *",
};
