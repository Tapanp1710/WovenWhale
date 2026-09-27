import type { OrderSummaryDTO, Paginated } from "@wovenwhale/backend/contracts";
import { Package } from "lucide-react";
import { OrderList } from "@/components/store/account/OrderList";
import { Pagination } from "@/components/store/catalog/Pagination";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { sessionApi } from "@/lib/api/server";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const orders = await sessionApi<Paginated<OrderSummaryDTO>>(`/orders?page=${page}&pageSize=10`);
  if (orders.total === 0) {
    return (
      <EmptyState
        icon={<Package size={26} aria-hidden="true" />}
        title="No orders yet"
        action={<ButtonLink href="/shop">Start shopping</ButtonLink>}
      >
        When you place an order, you can track it here.
      </EmptyState>
    );
  }
  return (
    <>
      <OrderList orders={orders.items} />
      <Pagination page={orders.page} totalPages={orders.totalPages} basePath="/account/orders" params={new URLSearchParams()} />
    </>
  );
}
