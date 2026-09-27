import type { OrderDetailDTO } from "@wovenwhale/backend/contracts";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/store/account/OrderDetailView";
import { sessionApiOrNull } from "@/lib/api/server";

type Props = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Order ${(await params).orderNumber}` };
}

export default async function OrderPage({ params }: Props) {
  const { orderNumber } = await params;
  const order = await sessionApiOrNull<OrderDetailDTO>(`/orders/${encodeURIComponent(orderNumber)}`);
  if (!order) notFound();
  return <OrderDetailView order={order} />;
}
