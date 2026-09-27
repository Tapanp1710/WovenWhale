import type { ProductListResponse } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { CatalogView } from "@/components/store/catalog/CatalogView";
import { publicApi } from "@/lib/api/server";
import { toApiQuery, type SearchParams } from "@/lib/catalog-params";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Shop handwoven shirts and kurtas",
  description:
    "Every WovenWhale style: handwoven ikat, jamdani and kalamkari shirts and kurtas for men. Filter by size, colour, weave and price.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = toApiQuery(params);
  const data = await publicApi<ProductListResponse>(`/catalog/products?${query}`, 30);
  const crumbs = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop all" },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbJsonLd(crumbs))} />
      <CatalogView title="Shop all" breadcrumbs={crumbs} data={data} basePath="/shop" params={new URLSearchParams(query)} />
    </>
  );
}
