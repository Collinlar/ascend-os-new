import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import OrderList, { OwnerOrder } from "@/components/shop/OrderList";

export const dynamic = "force-dynamic";

// Business Mobile and Web order queue. Action first: new orders that need a
// decision sit at the top, everything settled falls below (OFF-008).

async function loadOrders(): Promise<OwnerOrder[] | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const { data: membership } = await db
      .from("business_membership")
      .select("business_id")
      .eq("person_id", personId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
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
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">Your orders</h1>
          <p className="text-sm text-mid-grey">
            New orders first. Confirm quickly, customers are waiting on WhatsApp.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {orders === null ? (
          <p className="py-16 text-center text-mid-grey">
            Verify your WhatsApp number to see your orders.
          </p>
        ) : orders.length === 0 ? (
          <div className="border border-line bg-white px-5 py-10 text-center">
            <p className="font-medium text-ink">No orders yet.</p>
            <p className="mt-2 text-sm text-mid-grey">
              Share your shop link on WhatsApp and your first order will land here.
            </p>
          </div>
        ) : (
          <OrderList orders={orders} />
        )}
      </div>
    </main>
  );
}
