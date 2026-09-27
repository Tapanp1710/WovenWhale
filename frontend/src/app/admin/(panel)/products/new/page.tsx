import type { AdminCategoryDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { sessionApi } from "@/lib/api/server";
import styles from "../products.module.css";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  if (!(await adminWith("products.manage"))) return <NoAccess what="product editing" />;
  const categories = await sessionApi<AdminCategoryDTO[]>("/admin/catalog/categories");
  return (
    <div className={styles.page}>
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title="New product"
        description="Create the product first; you can add sizes, opening stock and photos right after."
      />
      <ProductForm product={null} categories={categories} />
    </div>
  );
}
