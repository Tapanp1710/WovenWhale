import type { AdminCategoryDTO, AdminProductRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/components/admin/labels";
import { ProductFlags, ProductFlagsHeader } from "@/components/admin/products/ProductFlags";
import { ProductRowActions } from "@/components/admin/products/ProductRowActions";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { FilterForm } from "@/components/admin/ui/FilterForm";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { QuickFilters } from "@/components/admin/ui/QuickFilters";
import { ProductStatusBadge, StockStateBadge } from "@/components/admin/ui/StatusBadges";
import { cell, Table } from "@/components/admin/ui/Table";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField, TextField } from "@/components/ui/Field";
import { Price } from "@/components/ui/Price";
import { sessionApi } from "@/lib/api/server";
import { formatDate } from "@/lib/format";
import styles from "./products.module.css";

export const metadata: Metadata = { title: "Products" };

const KEYS = ["q", "category", "status", "stock", "sort", "page"] as const;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await adminWith("products.view");
  if (!admin) return <NoAccess what="products" />;
  const params = await readParams(searchParams, KEYS);
  const [data, categories] = await Promise.all([
    sessionApi<Paginated<AdminProductRowDTO>>(`/admin/catalog/products${toQuery({ ...params, pageSize: "25" })}`),
    sessionApi<AdminCategoryDTO[]>("/admin/catalog/categories"),
  ]);
  const filtered = KEYS.some((k) => k !== "page" && k !== "sort" && params[k]);
  const only = (key: string, value: string) => Object.keys(params).length === 1 && params[key] === value;

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything in the catalogue: prices, stock by size, visibility and storefront placement."
        actions={
          can(admin, "products.manage") && (
            <ButtonLink href="/admin/products/new" size="sm" icon={<Plus size={16} aria-hidden="true" />}>
              Add product
            </ButtonLink>
          )
        }
      />
      <Panel flush>
        <QuickFilters
          label="Quick filters"
          items={[
            { href: "/admin/products", label: "All products", active: Object.keys(params).length === 0 },
            { href: "/admin/products?stock=LOW_STOCK", label: "Low stock", active: only("stock", "LOW_STOCK"), attention: true },
            { href: "/admin/products?stock=OUT_OF_STOCK", label: "Out of stock", active: only("stock", "OUT_OF_STOCK") },
            { href: "/admin/products?status=DRAFT", label: "Drafts", active: only("status", "DRAFT") },
            { href: "/admin/products?status=ARCHIVED", label: "Archived", active: only("status", "ARCHIVED") },
          ]}
        />
        <FilterForm key={JSON.stringify(params)} hasFilters={filtered}>
          <TextField label="Search" name="q" type="search" placeholder="Name, SKU or slug" defaultValue={params.q} />
          <SelectField label="Category" name="category" defaultValue={params.category ?? ""}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Active and drafts</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </SelectField>
          <SelectField label="Stock" name="stock" defaultValue={params.stock ?? ""}>
            <option value="">All</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </SelectField>
          <SelectField label="Sort" name="sort" defaultValue={params.sort ?? "updated"}>
            <option value="updated">Recently updated</option>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="stock-asc">Stock: lowest first</option>
            <option value="stock-desc">Stock: highest first</option>
          </SelectField>
        </FilterForm>
        {data.items.length ? (
          <>
            <p className={styles.legend}>
              Status controls visibility: <strong>Active</strong> is in the store, <strong>Draft</strong> is hidden while you prepare it,{" "}
              <strong>Archived</strong> is retired but kept for past orders. The storefront switches only change placement.
            </p>
            <Table label="Products" minWidth={1040}>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Price</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <ProductFlagsHeader />
                  </th>
                  <th scope="col" className={cell.actions}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} data-product={p.sku}>
                    <td>
                      <div className={cell.media}>
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className={cell.thumb} loading="lazy" />
                        ) : (
                          <span className={cell.thumb} />
                        )}
                        <span>
                          <Link href={`/admin/products/${p.id}`} className={cell.link}>
                            {p.name}
                          </Link>
                          <span className={cell.sub}>
                            {p.sku} · {p.categories.join(", ") || "No category"} · updated {formatDate(p.updatedAt)}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Price pricePaise={p.pricePaise} mrpPaise={p.mrpPaise} size="sm" />
                    </td>
                    <td data-stock={p.totalStock}>
                      <span className={styles.stock}>
                        <strong>{p.totalStock}</strong> <StockStateBadge state={p.stockState} />
                      </span>
                      <span className={cell.sub}>
                        {p.variantCount} {p.variantCount === 1 ? "size" : "sizes"}
                        {p.outVariants > 0 && p.stockState !== "OUT_OF_STOCK" && ` · ${p.outVariants} sold out`}
                        {p.lowVariants > 0 && ` · ${p.lowVariants} low`}
                      </span>
                    </td>
                    <td>
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td>
                      <ProductFlags product={p} />
                    </td>
                    <td className={cell.actions}>
                      <ProductRowActions product={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination basePath="/admin/products" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<Package size={26} aria-hidden="true" />} title={filtered ? "No products match" : "No products yet"}>
            {filtered ? "Try different filters." : "Add your first product to start selling."}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
