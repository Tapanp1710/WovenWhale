import type { CategoryDTO, ProductListResponse } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogView } from "@/components/store/catalog/CatalogView";
import { publicApi, publicApiOrNull } from "@/lib/api/server";
import { toApiQuery, type SearchParams } from "@/lib/catalog-params";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";

type Props = { params: Promise<{ category: string }>; searchParams: Promise<SearchParams> };

async function loadCategory(slug: string) {
  const categories = await publicApi<CategoryDTO[]>("/catalog/categories", 300).catch(() => []);
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const c = await loadCategory(category);
  if (!c) return { title: "Collection not found" };
  return {
    title: c.seoTitle ?? `${c.name} for men`,
    description: c.seoDescription ?? `Shop ${c.productCount} handwoven ${c.name.toLowerCase()} styles from WovenWhale. Free delivery over ₹999 and 14-day returns.`,
    alternates: { canonical: `/shop/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  const query = toApiQuery(await searchParams, { category });
  const data = await publicApiOrNull<ProductListResponse>(`/catalog/products?${query}`, 30);
  if (!data?.category) notFound();

  const crumbs = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop" },
    { href: `/shop/${data.category.slug}`, label: data.category.name },
  ];
  const pageParams = new URLSearchParams(query);
  pageParams.delete("category");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbJsonLd(crumbs))} />
      <CatalogView
        title={data.category.name}
        description={data.category.description}
        breadcrumbs={crumbs}
        data={data}
        basePath={`/shop/${data.category.slug}`}
        params={pageParams}
      />
    </>
  );
}
