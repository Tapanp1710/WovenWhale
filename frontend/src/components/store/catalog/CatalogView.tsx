import type { ProductListResponse } from "@wovenwhale/backend/contracts";
import { SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductGrid } from "../product/ProductGrid";
import { CatalogToolbar } from "./CatalogToolbar";
import { FilterControls } from "./FilterControls";
import { Pagination } from "./Pagination";
import styles from "./CatalogView.module.css";

interface Props {
  title: string;
  description?: string | null;
  breadcrumbs: { href: string; label: string }[];
  data: ProductListResponse;
  basePath: string;
  params: URLSearchParams;
  emptyAction?: ReactNode;
}

export function CatalogView({ title, description, breadcrumbs, data, basePath, params, emptyAction }: Props) {
  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <ol>
          {breadcrumbs.map((b, i) => (
            <li key={b.href}>
              {i < breadcrumbs.length - 1 ? <Link href={b.href}>{b.label}</Link> : <span aria-current="page">{b.label}</span>}
            </li>
          ))}
        </ol>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Filters">
          <FilterControls facets={data.facets} />
        </aside>
        <div className={styles.results}>
          <CatalogToolbar facets={data.facets} total={data.total} />
          {data.items.length > 0 ? (
            <>
              <ProductGrid products={data.items} preloadFirst={4} columns={3} />
              <Pagination page={data.page} totalPages={data.totalPages} basePath={basePath} params={params} />
            </>
          ) : (
            <EmptyState
              icon={<SearchX size={26} aria-hidden="true" />}
              title="No styles match these filters"
              action={
                emptyAction ?? (
                  <ButtonLink href={basePath} variant="secondary">
                    Clear filters
                  </ButtonLink>
                )
              }
            >
              Try removing a filter, or choose a different size or colour.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
