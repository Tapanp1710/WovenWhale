import type { AdminMfaStatusDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { SecuritySettings } from "@/components/admin/security/SecuritySettings";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Sign-in security" };

export default async function SecurityPage() {
  const status = await sessionApi<AdminMfaStatusDTO>("/admin/auth/2fa/status");
  return <SecuritySettings status={status} />;
}
