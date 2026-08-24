// Groq client and prompt templates for AscendSME AI assistance.
// First use: photo-led catalogue onboarding (SHP-002). The merchant reviews
// and approves every AI suggestion before publication (SHP-003);
// suggestions carry source, confidence and approval status (API-012).
//
// Replaces the Anthropic client. Groq serves an OpenAI-shaped API, so this
// talks to it with plain fetch rather than pulling in another SDK.

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Checked against the live account: this is the only model on the key that
// accepts images, which is the whole job here. Groq's catalogue changes and
// models get retired, so it is overridable without a deploy, and a
// decommissioned model reports itself plainly rather than as a failed photo.
const DEFAULT_MODEL = "qwen/qwen3.6-27b";

function model(): string {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

export interface CatalogueSuggestion {
  name: string;
  description: string;
  category: string;
  visible_attributes: string[];
  suggested_price_note: string;
  confidence: "high" | "medium" | "low";
}

export class AiUnavailable extends Error {
  constructor(
    readonly kind: "unconfigured" | "rate_limited" | "bad_model" | "unusable",
    message: string
  ) {
    super(message);
  }
}

const SYSTEM_PROMPT = `You help Ghanaian small business owners turn product photos into a credible catalogue. You write as if a human expert who knows Ghana wrote it, not as an AI assistant summarising information.

Context: the merchant sells to Ghanaian customers. Prices are in GHS. Customers pay with MTN MoMo, Telecel Cash or cash on delivery. Typical merchants operate in Accra, Kumasi or Takoradi and sell through WhatsApp and Instagram before they get a proper shop page.

Reply with a single JSON object and nothing else. No commentary, no code fences, no reasoning.

The object has exactly these keys:
- "name": string. Short, specific, the words a real shopper types. Plain and confident.
- "description": string. 2 to 3 sentences. Concrete and sensory where the photo supports it. Warm and direct, like a good market seller who respects your time. Never oversell what the photo does not show.
- "category": string. One familiar retail category in plain English.
- "visible_attributes": array of strings. Only what is actually visible. Never guess sizes or materials you cannot see.
- "suggested_price_note": string. One sentence helping the merchant think about their price in GHS. Never state a specific price as fact.
- "confidence": one of "high", "medium", "low". Use "high" only when the product type is unmistakable.

Your output must not contain em dashes. Your output must not contain any of the following phrases: "In today's fast-paced world", "Leverage your full potential", "Unlock the power of", "Take your business to the next level", "Seamlessly integrate", "Best-in-class", "Cutting-edge", "Robust solution", "Streamlined", "Game-changing", "Innovative approach", "Transformative experience", "Empowering businesses to", "In the digital age", "In an increasingly competitive landscape", "It's never been easier to".`;

// Reasoning models narrate before answering, and that narration lands in
// the same field as the answer. Strict JSON mode rejects the whole reply
// when it does. So the thinking is asked off, then stripped if it arrives
// anyway, then the first JSON object is taken from whatever is left.
function extractJson(raw: string): unknown {
  const withoutThinking = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  try {
    return JSON.parse(withoutThinking);
  } catch {
    // Fall through to locating an object inside surrounding prose.
  }

  const start = withoutThinking.indexOf("{");
  const end = withoutThinking.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutThinking.slice(start, end + 1));
  } catch {
    return null;
  }
}

// The model is a stranger. Nothing reaches a merchant's catalogue without
// being checked into the shape this app promised.
function asSuggestion(value: unknown): CatalogueSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");

  const name = str("name");
  const description = str("description");
  if (!name) return null;

  const confidence = ["high", "medium", "low"].includes(String(v.confidence))
    ? (v.confidence as CatalogueSuggestion["confidence"])
    : "low";

  return {
    name,
    description,
    category: str("category") || "General",
    visible_attributes: Array.isArray(v.visible_attributes)
      ? v.visible_attributes.filter((a): a is string => typeof a === "string")
      : [],
    suggested_price_note: str("suggested_price_note"),
    confidence,
  };
}

export async function suggestCatalogueFromPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  merchantHint?: string
): Promise<CatalogueSuggestion> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new AiUnavailable("unconfigured", "GROQ_API_KEY is not set");
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model(),
        // Room for the answer even if the model narrates despite being
        // asked not to. Too small a budget truncates mid-object, which
        // reads as a refusal rather than as running out of room.
        max_tokens: 1600,
        temperature: 0.4,
        reasoning_effort: "none",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: merchantHint
                  ? `The merchant says: "${merchantHint}". Suggest catalogue content for this product. JSON only.`
                  : "Suggest catalogue content for this product. JSON only.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mediaType};base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new AiUnavailable("unusable", "Could not reach Groq");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = String(
      (body as { error?: { message?: string } } | null)?.error?.message ?? ""
    );

    // A free tier runs out of tokens long before it runs out of month, and
    // a merchant should be told to wait rather than left thinking the photo
    // was the problem.
    if (response.status === 429) {
      throw new AiUnavailable("rate_limited", message || "Rate limited");
    }
    if (/decommissioned|does not exist|not found/i.test(message)) {
      throw new AiUnavailable("bad_model", message);
    }
    throw new AiUnavailable("unusable", message || `Groq returned ${response.status}`);
  }

  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  const content = data?.choices?.[0]?.message?.content ?? "";
  const suggestion = asSuggestion(extractJson(content));
  if (!suggestion) {
    throw new AiUnavailable("unusable", "Could not read a suggestion from the reply");
  }
  return suggestion;
}
