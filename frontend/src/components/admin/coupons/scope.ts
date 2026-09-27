import "server-only";
import type { AdminCategoryDTO, AdminProductRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { sessionApi } from "@/lib/api/server";

/**
 * Categories and products a coupon can be limited to.
 * ponytail: first 100 products only (API page cap); add server-side product search to the picker when the catalog outgrows it.
 */
export async function loadScopeOptions() {
  const [categories, products] = await Promise.all([
    sessionApi<AdminCategoryDTO[]>("/admin/catalog/categories").catch(() => []),
    sessionApi<Paginated<AdminProductRowDTO>>("/admin/catalog/products?pageSize=100").catch(() => null),
  ]);
  return { categories, products: (products?.items ?? []).map((p) => ({ id: p.id, name: p.name, sku: p.sku })) };
}
