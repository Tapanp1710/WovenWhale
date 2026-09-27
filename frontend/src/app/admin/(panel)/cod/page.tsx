import type { AdminOrderRowDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { CodQueue } from "@/components/admin/dashboard/CodQueue";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "COD approvals" };

export default async function CodPage() {
  if (!(await adminWith("orders.view"))) return <NoAccess what="orders" />;
  const rows = await sessionApi<AdminOrderRowDTO[]>("/admin/orders/cod-pending");
  return (
    <>
      <PageHeader
        title="COD approvals"
        description="Cash on delivery orders wait here until someone confirms them with the customer. Approving confirms the order; rejecting releases its stock and tells the customer."
      />
      <Panel flush tone={rows.length ? "attention" : undefined} title={`${rows.length} waiting`} description="Oldest orders first.">
        <CodQueue rows={rows} />
      </Panel>
    </>
  );
}
