import type { AdminProductRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/components/admin/labels";
import { ProductFlags, ProductFlagsHeader } from "@/components/admin/products/ProductFlags";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { FilterForm } from "@/components/admin/ui/FilterForm";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { cell, Table } from "@/components/admin/ui/Table";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/Field";
import { Price } from "@/components/ui/Price";
import { sessionApi } from "@/lib/api/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await adminWith("products.view");
  if (!admin) return <NoAccess what="products" />;
  const params = await readParams(searchParams, ["q", "page"]);
  const data = await sessionApi<Paginated<AdminProductRowDTO>>(`/admin/catalog/products${toQuery({ ...params, pageSize: "25" })}`);

  return (
    <>
      <PageHeader
        title="Products"
        description="Prices, stock and merchandising flags. Switches save immediately."
        actions={
          can(admin, "products.manage") && (
            <ButtonLink href="/admin/products/new" size="sm" icon={<Plus size={16} aria-hidden="true" />}>
              Add product
            </ButtonLink>
          )
        }
      />
      <Panel flush>
        <FilterForm key={params.q ?? ""} hasFilters={Boolean(params.q)}>
          <TextField label="Search" name="q" type="search" placeholder="Name, SKU or slug" defaultValue={params.q} />
        </FilterForm>
        {data.items.length ? (
          <>
            <Table label="Products" minWidth={980}>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Price</th>
                  <th scope="col" className={cell.num}>
                    Stock
                  </th>
                  <th scope="col">
                    <ProductFlagsHeader />
                  </th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
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
                            {p.sku} · {p.categories.join(", ") || "No category"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Price pricePaise={p.pricePaise} mrpPaise={p.mrpPaise} size="sm" />
                    </td>
                    <td className={cell.num}>
                      <span className={p.totalStock === 0 ? cell.strong : undefined}>{p.totalStock}</span>
                      <span className={cell.sub}>
                        {p.variantCount} {p.variantCount === 1 ? "size" : "sizes"}
                      </span>
                    </td>
                    <td>
                      <ProductFlags product={p} />
                    </td>
                    <td className={`${cell.nowrap} ${cell.muted}`}>{formatDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination basePath="/admin/products" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<Package size={26} aria-hidden="true" />} title={params.q ? "No products match" : "No products yet"}>
            {params.q ? "Try a different name or SKU." : "Add your first product to start selling."}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
