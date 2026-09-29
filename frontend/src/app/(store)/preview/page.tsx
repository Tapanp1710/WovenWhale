import type { PublicPageDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/components/admin/labels";
import { getAdmin } from "@/components/admin/server";
import { PreviewBridge } from "@/components/admin/website/PreviewBridge";
import { PageSections } from "@/components/store/home/PageSections";
import { publicApi, sessionApi } from "@/lib/api/server";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * Unpublished homepage, rendered with the storefront's own components.
 * Only admins who can edit the website see it (the API checks again).
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { version = "draft", editor } = await searchParams;
  const admin = await getAdmin();
  if (!admin) redirect(`/admin/login?next=${encodeURIComponent("/preview")}`);
  if (!can(admin, "content.manage")) redirect("/");
  const [page, config] = await Promise.all([
    sessionApi<PublicPageDTO>(`/admin/content/pages/home/preview?version=${encodeURIComponent(version)}`),
    publicApi<StoreConfigDTO>("/catalog/config", 300),
  ]);
  const inEditor = editor === "1";
  return (
    <>
      {!inEditor && (
        <p className={styles.bar} role="status">
          Preview of {version === "draft" ? "the draft" : `version ${version}`}. Customers don&apos;t see this page.
        </p>
      )}
      <PageSections sections={page.sections} config={config} editor={inEditor} />
      {inEditor && <PreviewBridge />}
    </>
  );
}
