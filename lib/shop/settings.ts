// Shop settings for the customer side (Modules round 2, R3): how an order
// reaches the customer and what that costs, the returns line, how to reach
// the shop, and the one promotion. Stored in shop_settings (0143). A shop
// with no row offers pickup and delivery with no fee, as before.

export interface DeliveryArea {
  name: string;
  fee: number;
}

export interface ShopSettings {
  pickupEnabled: boolean;
  /** Minutes until a pickup order is ready, or null for no promise. */
  pickupReadyMinutes: number | null;
  deliveryEnabled: boolean;
  deliveryAreas: DeliveryArea[];
  /** "15:00": orders before this are delivered the same day. */
  deliveryCutoff: string | null;
  deliveryNote: string;
  returnsDays: number | null;
  returnsNote: string;
  contactLine: string;
  promo: {
    headline: string;
    body: string;
    itemId: string | null;
    until: string | null;
  };
  /** True once the owner has saved settings. */
  saved: boolean;
}

export const DEFAULT_SETTINGS: ShopSettings = {
  pickupEnabled: true,
  pickupReadyMinutes: null,
  deliveryEnabled: true,
  deliveryAreas: [],
  deliveryCutoff: null,
  deliveryNote: "",
  returnsDays: null,
  returnsNote: "",
  contactLine: "",
  promo: { headline: "", body: "", itemId: null, until: null },
  saved: false,
};

type Row = Record<string, unknown>;

export function settingsFromRow(row: Row | null): ShopSettings {
  if (!row) return DEFAULT_SETTINGS;
  const areas = Array.isArray(row.delivery_areas) ? (row.delivery_areas as Row[]) : [];
  return {
    pickupEnabled: row.pickup_enabled !== false,
    pickupReadyMinutes: row.pickup_ready_minutes === null || row.pickup_ready_minutes === undefined ? null : Number(row.pickup_ready_minutes),
    deliveryEnabled: row.delivery_enabled !== false,
    deliveryAreas: areas
      .map((a) => ({ name: String(a.name ?? "").trim(), fee: Number(a.fee ?? 0) }))
      .filter((a) => a.name && Number.isFinite(a.fee)),
    deliveryCutoff: row.delivery_cutoff ? String(row.delivery_cutoff).slice(0, 5) : null,
    deliveryNote: (row.delivery_note as string) ?? "",
    returnsDays: row.returns_days === null || row.returns_days === undefined ? null : Number(row.returns_days),
    returnsNote: (row.returns_note as string) ?? "",
    contactLine: (row.contact_line as string) ?? "",
    promo: {
      headline: (row.promo_headline as string) ?? "",
      body: (row.promo_body as string) ?? "",
      itemId: (row.promo_item_id as string) ?? null,
      until: (row.promo_until as string) ?? null,
    },
    saved: true,
  };
}

export const SETTINGS_COLUMNS =
  "pickup_enabled, pickup_ready_minutes, delivery_enabled, delivery_areas, delivery_cutoff, delivery_note, returns_days, returns_note, contact_line, promo_headline, promo_body, promo_item_id, promo_until";

/** "2 hours", "45 minutes", "1 day". */
export function readyIn(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} minutes`;
}

/** "3pm", "11:30am". */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

const ghs = (n: number) => `GHS ${n.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

/** The cheapest delivery, for "from GHS 30". */
export function lowestFee(areas: DeliveryArea[]): number | null {
  return areas.length ? Math.min(...areas.map((a) => a.fee)) : null;
}

/** What a customer reads about pickup and delivery, in the design's words. */
export function fulfilmentFacts(s: ShopSettings, places: string[]): {
  pickup: { title: string; detail: string } | null;
  delivery: { title: string; detail: string } | null;
  returns: string | null;
} {
  const where = places.length ? places.join(" or ") : null;
  const pickup = s.pickupEnabled
    ? {
        title: "Free pickup",
        detail: [where, s.pickupReadyMinutes ? `ready in ${readyIn(s.pickupReadyMinutes)}` : null].filter(Boolean).join(" · ") || "Collect from the shop",
      }
    : null;
  const low = lowestFee(s.deliveryAreas);
  const delivery = s.deliveryEnabled
    ? {
        title: s.deliveryAreas.length === 1 ? `${s.deliveryAreas[0].name} delivery` : "Delivery",
        detail:
          [
            low === null ? "Cost agreed on WhatsApp" : s.deliveryAreas.length === 1 ? ghs(low) : `from ${ghs(low)}`,
            s.deliveryCutoff ? `order before ${clock(s.deliveryCutoff)} for today` : null,
          ]
            .filter(Boolean)
            .join(" · "),
      }
    : null;
  const returns =
    s.returnsDays === null
      ? s.returnsNote || null
      : s.returnsDays === 0
        ? s.returnsNote || "No returns on these items"
        : `${s.returnsDays}-day returns${s.returnsNote ? `. ${s.returnsNote}` : ""}`;
  return { pickup, delivery, returns };
}

/** Whether the promotion is showing today. */
export function promoLive(s: ShopSettings, today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" })): boolean {
  return Boolean(s.promo.headline.trim()) && (!s.promo.until || s.promo.until >= today);
}
