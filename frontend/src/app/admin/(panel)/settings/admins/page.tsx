import type { AdminUserDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { AdminUsers } from "@/components/admin/settings/AdminUsers";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Admin users" };

export default async function AdminUsersPage() {
  if (!(await adminWith("admins.manage"))) return <NoAccess what="admin users" />;
  const admins = await sessionApi<AdminUserDTO[]>("/admin/admins");
  return <AdminUsers admins={admins} />;
}
