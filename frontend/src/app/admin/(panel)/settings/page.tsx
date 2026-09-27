import type { StoreSettingsDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings/SettingsForm";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  if (!(await adminWith("settings.manage"))) return <NoAccess what="store settings" />;
  const settings = await sessionApi<StoreSettingsDTO>("/admin/settings");
  return (
    <>
      <PageHeader title="Store settings" description="Changes apply to new checkouts straight away." />
      <SettingsForm settings={settings} />
    </>
  );
}
