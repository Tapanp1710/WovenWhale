import type { PublicPageDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import { PageSections } from "@/components/store/home/PageSections";
import { publicApi } from "@/lib/api/server";
import { SITE_URL } from "@/lib/format";
import { jsonLd } from "@/lib/seo";

export const revalidate = 60;

/** The homepage as published from Admin → Website editor (publishing revalidates it at once). */
export default async function HomePage() {
  const [page, config] = await Promise.all([
    publicApi<PublicPageDTO>("/content/pages/home", 60, ["catalog", "content"]),
    publicApi<StoreConfigDTO>("/catalog/config", 300),
  ]);

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "WovenWhale",
    url: SITE_URL,
    logo: `${SITE_URL}/brand/wovenwhale-logo.webp`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organization)} />
      <PageSections sections={page.sections} config={config} />
    </>
  );
}
