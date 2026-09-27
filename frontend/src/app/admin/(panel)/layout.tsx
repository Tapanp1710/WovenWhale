import type { AdminOrderRowDTO } from "@wovenwhale/backend/contracts";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can } from "@/components/admin/labels";
import { getAdmin } from "@/components/admin/server";
import { AdminFrame } from "@/components/admin/shell/AdminFrame";
import { sessionApi } from "@/lib/api/server";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const cod = can(admin, "orders.view") ? await sessionApi<AdminOrderRowDTO[]>("/admin/orders/cod-pending").catch(() => null) : null;
  return (
    <AdminFrame admin={admin} codPending={cod?.length ?? null}>
      {children}
    </AdminFrame>
  );
}
