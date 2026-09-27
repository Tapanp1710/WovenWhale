import type { AdminOrderRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { OrderFilters } from "@/components/admin/orders/OrderFilters";
import { OrdersTable } from "@/components/admin/orders/OrdersTable";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { QuickFilters } from "@/components/admin/ui/QuickFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Orders" };

const KEYS = ["q", "status", "paymentStatus", "paymentMethod", "from", "to", "sort", "page"] as const;
/** Dates are picked as IST calendar days; send whole-day bounds. */
const dayStart = (d?: string) => (d ? `${d}T00:00:00+05:30` : undefined);
const dayEnd = (d?: string) => (d ? `${d}T23:59:59.999+05:30` : undefined);

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("orders.view"))) return <NoAccess what="orders" />;
  const params = await readParams(searchParams, KEYS);
  const data = await sessionApi<Paginated<AdminOrderRowDTO>>(
    `/admin/orders${toQuery({ ...params, from: dayStart(params.from), to: dayEnd(params.to), pageSize: "25" })}`,
  );
  const preset = (p: Record<string, string>) => `/admin/orders${toQuery(p)}`;
  const only = (key: string, value: string) => Object.keys(params).length === 1 && params[key] === value;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Search, filter and open any order. Filters stay in the address bar, so a view can be shared."
      />
      <Panel flush>
        <QuickFilters
          label="Quick filters"
          items={[
            { href: "/admin/orders", label: "All orders", active: Object.keys(params).length === 0 },
            {
              href: preset({ status: "PENDING_COD_APPROVAL" }),
              label: "COD pending approval",
              active: only("status", "PENDING_COD_APPROVAL"),
              attention: true,
            },
            { href: preset({ status: "CONFIRMED" }), label: "Ready to process", active: only("status", "CONFIRMED") },
            { href: preset({ status: "PACKED" }), label: "Ready to ship", active: only("status", "PACKED") },
            { href: preset({ paymentStatus: "PAYMENT_FAILED" }), label: "Payment failed", active: only("paymentStatus", "PAYMENT_FAILED") },
          ]}
        />
        <OrderFilters params={params} />
        {data.items.length ? (
          <>
            <OrdersTable rows={data.items} />
            <Pagination basePath="/admin/orders" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<ReceiptText size={26} aria-hidden="true" />} title="No orders match">
            Try a different search or clear the filters.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
