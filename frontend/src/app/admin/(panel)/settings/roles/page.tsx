import type { RoleDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { RoleMatrix } from "@/components/admin/settings/RoleMatrix";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  if (!(await adminWith("admins.manage"))) return <NoAccess what="roles" />;
  const roles = await sessionApi<RoleDTO[]>("/admin/roles");
  return (
    <>
      <PageHeader
        title="Roles"
        description="Tick what each role may do. The API checks these on every request, and hidden buttons follow the same rules. Super admin is locked to every permission."
      />
      <RoleMatrix roles={roles} />
    </>
  );
}
