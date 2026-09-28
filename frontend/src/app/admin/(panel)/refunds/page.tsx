import type { AdminRefundRowDTO } from "@wovenwhale/backend/contracts";
import { Banknote } from "lucide-react";
import type { Metadata } from "next";
import { RefundsTable } from "@/components/admin/orders/RefundsTable";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { QuickFilters } from "@/components/admin/ui/QuickFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Refunds" };

/** Every refund across orders: bank/UPI payouts to record, failed gateway refunds to retry. */
export default async function RefundsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("returns.view", "refunds.approve"))) return <NoAccess what="refunds" />;
  const params = await readParams(searchParams, ["status"]);
  const refunds = await sessionApi<AdminRefundRowDTO[]>(`/admin/refunds${toQuery(params)}`);

  return (
    <>
      <PageHeader
        title="Refunds"
        description="Refunds to the original payment complete on their own. Bank transfer and UPI refunds for cash-on-delivery orders need to be sent, then recorded here."
      />
      <Panel flush>
        <QuickFilters
          label="Quick filters"
          items={[
            { href: "/admin/refunds", label: "All refunds", active: !params.status },
            { href: "/admin/refunds?status=PENDING", label: "To pay out", active: params.status === "PENDING", attention: true },
            { href: "/admin/refunds?status=FAILED", label: "Failed", active: params.status === "FAILED" },
            { href: "/admin/refunds?status=PROCESSED", label: "Completed", active: params.status === "PROCESSED" },
          ]}
        />
        {refunds.length ? (
          <RefundsTable refunds={refunds} showOrder />
        ) : (
          <EmptyState icon={<Banknote size={28} aria-hidden="true" />} title="No refunds here">
            Refunds appear when a return is refunded or a paid order is cancelled.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
