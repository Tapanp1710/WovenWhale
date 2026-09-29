import type { AdminCategoryDTO, AdminPageDTO, PageVersionDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { WebsiteEditor } from "@/components/admin/website/WebsiteEditor";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Website editor" };

export default async function WebsiteEditorPage() {
  if (!(await adminWith("content.manage"))) return <NoAccess what="the website editor" />;
  const [page, versions, categories] = await Promise.all([
    sessionApi<AdminPageDTO>("/admin/content/pages/home"),
    sessionApi<PageVersionDTO[]>("/admin/content/pages/home/versions"),
    sessionApi<AdminCategoryDTO[]>("/admin/catalog/categories"),
  ]);
  return <WebsiteEditor page={page} versions={versions} categories={categories.filter((c) => c.isActive)} />;
}
