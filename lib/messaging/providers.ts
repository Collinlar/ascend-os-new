// Messaging providers (Communications C4, spec 05 section 10). The engine
// owns consent, cost, templates and delivery states; a provider only
// carries a message to a channel and says what happened. Like payments
// (lib/payments/provider.ts), each provider sits behind one interface, so a
// second WhatsApp provider or SMS is a new entry here, not an edit to the
// dispatcher.
//
// Today: WhatsApp through 360dialog, email through Resend, and a dev
// provider that logs instead of sending when no key is set. SMS has a slot
// and no provider yet (decision 6: when a business asks for it; Africa's
// Talking is the expected one).

export type Channel = "whatsapp" | "email" | "sms" | "in_app" | "secure_link";

export interface TemplateSend {
  name: string;
  namespace?: string;
  params: string[];
}

export interface OutboundMessage {
  channel: string;
  recipient: string;
  body: string;
  subject?: string | null;
  /** Outside WhatsApp's 24-hour window, a registered template. */
  template?: TemplateSend;
}

export interface SendOutcome {
  ok: boolean;
  reference?: string;
  reason?: string;
}

export interface DeliveryResult extends SendOutcome {
  /** Which provider took the call: 360dialog, resend, dev, or none. */
  provider: string;
}

export interface MessagingProvider {
  readonly name: string;
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<SendOutcome>;
}

type Env = Record<string, string | undefined>;

// What every provider on a channel would refuse anyway, checked once,
// before any provider (dev included) is called.
function invalid(message: OutboundMessage): string | null {
  if (message.channel === "email") {
    return !message.recipient || !message.recipient.includes("@") ? "no recipient email address" : null;
  }
  if (message.channel === "whatsapp") {
    if (!message.recipient) return "no recipient number";
    if (message.template && !message.template.name) return "template not registered with the provider";
    return null;
  }
  return null;
}

export function whatsapp360dialog(apiKey: string, fetchImpl: typeof fetch = fetch): MessagingProvider {
  return {
    name: "360dialog",
    channel: "whatsapp",
    async send(message) {
      const to = message.recipient.replace("+", "");
      const requestBody = message.template
        ? {
            to,
            type: "template",
            template: {
              name: message.template.name,
              namespace: message.template.namespace,
              language: { code: "en", policy: "deterministic" },
              components: [
                {
                  type: "body",
                  parameters: message.template.params.map((text) => ({ type: "text", text })),
                },
              ],
            },
          }
        : { to, type: "text", text: { body: message.body } };

      const response = await fetchImpl("https://waba.360dialog.io/v1/messages", {
        method: "POST",
        headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return { ok: false, reason: `provider rejected (${response.status})` };
      }
      const result = (await response.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
      return { ok: true, reference: result.messages?.[0]?.id };
    },
  };
}

// Email is for the customer paying on account, whose accounts team works
// from an inbox. WhatsApp stays the default channel for Ghana.
export function resendEmail(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): MessagingProvider {
  return {
    name: "resend",
    channel: "email",
    async send(message) {
      try {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [message.recipient], subject: message.subject ?? "", text: message.body }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          return { ok: false, reason: `email provider returned ${response.status}` };
        }
        const data = (await response.json()) as { id?: string };
        return { ok: true, reference: data.id };
      } catch {
        return { ok: false, reason: "could not reach the email provider" };
      }
    },
  };
}

// Development: nothing is sent or charged for real, and the message shows
// in the logs so the flow stays testable without a provider.
export function devProvider(channel: Channel): MessagingProvider {
  return {
    name: "dev",
    channel,
    async send(message) {
      const who = channel === "whatsapp" ? `${message.recipient.slice(0, 7)}…` : message.recipient;
      const what = message.template ? `template ${message.template.name}` : channel === "email" ? message.subject ?? "(no subject)" : "text";
      console.info(`[dev] ${channel} ${what} to ${who}: ${message.body}`);
      return { ok: true, reference: "dev-mode" };
    },
  };
}

/** The provider for a channel, from the environment. Null when the channel has none. */
export function providerFor(channel: string, env: Env = process.env, fetchImpl: typeof fetch = fetch): MessagingProvider | null {
  if (channel === "whatsapp") {
    return env.WHATSAPP_360DIALOG_API_KEY ? whatsapp360dialog(env.WHATSAPP_360DIALOG_API_KEY, fetchImpl) : devProvider("whatsapp");
  }
  if (channel === "email") {
    return env.RESEND_API_KEY && env.EMAIL_FROM ? resendEmail(env.RESEND_API_KEY, env.EMAIL_FROM, fetchImpl) : devProvider("email");
  }
  // SMS, push and in-app have no provider yet.
  return null;
}

/** Carry one message through its channel's provider. Never throws for a provider's refusal. */
export async function deliver(message: OutboundMessage, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult> {
  const provider = providerFor(message.channel, env, fetchImpl);
  if (!provider) {
    return { ok: false, provider: "none", reason: `channel not configured: ${message.channel}` };
  }
  const problem = invalid(message);
  if (problem) {
    return { ok: false, provider: provider.name, reason: problem };
  }
  const outcome = await provider.send(message);
  return { ...outcome, provider: provider.name };
}
