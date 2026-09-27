import type { ProductListResponse } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { CatalogView } from "@/components/store/catalog/CatalogView";
import { SearchTracker } from "@/components/store/search/SearchTracker";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { publicApi } from "@/lib/api/server";
import { toApiQuery, type SearchParams } from "@/lib/catalog-params";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q;
  return { title: q ? `Search results for “${q}”` : "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const query = toApiQuery(params);
  const data = await publicApi<ProductListResponse>(`/catalog/products?${query}`, 0);
  return (
    <>
      {q && <SearchTracker query={q} />}
      <CatalogView
        title={q ? `Results for “${q}”` : "All styles"}
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: `/search${q ? `?q=${encodeURIComponent(q)}` : ""}`, label: "Search" },
        ]}
        data={data}
        basePath="/search"
        params={new URLSearchParams(query)}
        emptyAction={
          <ButtonLink href="/shop" variant="secondary">
            Browse all styles
          </ButtonLink>
        }
      />
    </>
  );
}
