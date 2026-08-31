import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import OrderList, { OwnerOrder } from "@/components/shop/OrderList";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// Business Mobile and Web order queue. Action first: new orders that need a
// decision sit at the top, everything settled falls below (OFF-008).

async function loadOrders(): Promise<OwnerOrder[] | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data } = await db
      .from("shop_order")
      .select(
        "id, status, fulfilment, total, currency_code, placed_at, delivery_detail, customer:customer_id(display_name, phone_e164), shop_order_line(description, quantity)"
      )
      .eq("business_id", membership.business_id)
      .order("placed_at", { ascending: false })
      .limit(50);

    return (data ?? []).map((o) => {
      const customer = o.customer as unknown as {
        display_name: string;
        phone_e164: string | null;
      } | null;
      const lines = (o.shop_order_line ?? []) as unknown as Array<{
        description: string;
        quantity: number;
      }>;
      const delivery = o.delivery_detail as { address?: string } | null;
      return {
        id: o.id,
        status: o.status,
        fulfilment: o.fulfilment,
        total: Number(o.total),
        placedAt: o.placed_at,
        customerName: customer?.display_name ?? "Customer",
        customerPhone: customer?.phone_e164 ?? null,
        deliveryAddress: delivery?.address ?? null,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
        })),
      };
    });
  } catch {
    return null;
  }
}

export default async function Orders() {
  const orders = await loadOrders();

  return (
    <PageShell>
      <PageHeader
        title="Your orders"
        intro="New orders first. Confirm quickly, customers are waiting on WhatsApp."
      />

      {orders === null ? (
        <EmptyState
          title="Sign in to see your orders."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet."
          detail="Share your shop link on WhatsApp and your first order will land here."
        />
      ) : (
        <OrderList orders={orders} />
      )}
    </PageShell>
  );
}
