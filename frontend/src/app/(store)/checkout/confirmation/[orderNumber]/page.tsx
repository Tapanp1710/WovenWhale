import type { OrderDetailDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderConfirmation } from "@/components/store/checkout/OrderConfirmation";
import { sessionApiOrNull } from "@/lib/api/server";

export const metadata: Metadata = { title: "Order placed", robots: { index: false, follow: false } };

export default async function ConfirmationPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await sessionApiOrNull<OrderDetailDTO>(`/orders/${encodeURIComponent(orderNumber)}`);
  if (!order) notFound();
  return <OrderConfirmation order={order} />;
}
