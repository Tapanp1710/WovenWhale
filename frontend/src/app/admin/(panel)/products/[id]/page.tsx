import type { AdminCategoryDTO, AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImagesEditor } from "@/components/admin/products/ImagesEditor";
import { ProductDangerZone } from "@/components/admin/products/ProductDangerZone";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { VariantsEditor } from "@/components/admin/products/VariantsEditor";
import { adminWith } from "@/components/admin/server";
import { Notice } from "@/components/admin/ui/Notice";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { ProductStatusBadge } from "@/components/admin/ui/StatusBadges";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { sessionApi, sessionApiOrNull } from "@/lib/api/server";
import styles from "../products.module.css";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await adminWith("products.view"))) return <NoAccess what="products" />;
  const { id } = await params;
  const [product, categories] = await Promise.all([
    sessionApiOrNull<AdminProductDetailDTO>(`/admin/catalog/products/${encodeURIComponent(id)}`),
    sessionApi<AdminCategoryDTO[]>("/admin/catalog/categories"),
  ]);
  if (!product) notFound();

  return (
    <div className={styles.page}>
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title={product.name}
        meta={<ProductStatusBadge status={product.status} />}
        description={product.sku}
        actions={
          product.status === "ACTIVE" && (
            <ButtonLink href={`/product/${product.slug}`} target="_blank" size="sm" variant="secondary">
              View in store
            </ButtonLink>
          )
        }
      />
      {product.status === "ARCHIVED" && (
        <Notice title="This product is archived">
          It isn&apos;t in the store and can&apos;t be edited. Restore it at the bottom of this page to make changes.
        </Notice>
      )}
      <ProductForm key={product.id} product={product} categories={categories} />
      <VariantsEditor product={product} />
      <ImagesEditor product={product} />
      <ProductDangerZone product={product} />
    </div>
  );
}
