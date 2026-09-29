import type { AdminOrderRowDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { CodQueue } from "@/components/admin/dashboard/CodQueue";
import { can, ROLE_LABELS } from "@/components/admin/labels";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { Notice } from "@/components/admin/ui/Notice";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "COD approvals" };

export default async function CodPage() {
  const admin = await adminWith("orders.view");
  if (!admin) return <NoAccess what="orders" />;
  const rows = await sessionApi<AdminOrderRowDTO[]>("/admin/orders/cod-pending");
  return (
    <>
      <PageHeader
        title="COD approvals"
        description="Cash on delivery orders wait here until someone confirms them with the customer. Approving confirms the order; rejecting releases its stock and tells the customer."
      />
      {rows.length > 0 && !can(admin, "orders.approve_cod") && (
        <Notice title="You can see these orders, but not approve or reject them">
          You're signed in as {ROLE_LABELS[admin.role]}. COD decisions are made by an owner, admin or order manager.
        </Notice>
      )}
      <Panel flush tone={rows.length ? "attention" : undefined} title={`${rows.length} waiting`} description="Oldest orders first.">
        <CodQueue rows={rows} />
      </Panel>
    </>
  );
}
