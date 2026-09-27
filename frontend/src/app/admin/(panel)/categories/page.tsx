import type { AdminCategoryDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { CategoryManager } from "@/components/admin/products/CategoryManager";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  if (!(await adminWith("products.view"))) return <NoAccess what="categories" />;
  const categories = await sessionApi<AdminCategoryDTO[]>("/admin/catalog/categories");
  return <CategoryManager categories={categories} />;
}
