import { and, isNotNull, isNull, not, sql, type SQL } from "drizzle-orm";
import type { ProductStatus, StockState } from "../../contracts/enums";
import { inventory, products, productVariants } from "../../db/schema";
import { ref } from "../../db/sql";

/**
 * Per-product stock figures over its active sizes, as SQL expressions, so the
 * product list can show, filter and sort by them in one query. Sizes without
 * an inventory row count as zero stock.
 */
export function productStockExpressions(defaultThreshold: number) {
  const scope = sql`from ${productVariants} v left join ${inventory} i on i.variant_id = v.id where v.product_id = ${ref(products.id)} and v.is_active`;
  const available = sql`greatest(coalesce(i.on_hand, 0) - coalesce(i.reserved, 0), 0)`;
  const threshold = sql`coalesce(i.low_stock_threshold, ${defaultThreshold})`;
  const total = sql<number>`coalesce((select sum(${available}) ${scope}), 0)::int`;
  const variants = sql<number>`(select count(*) ${scope})::int`;
  const low = sql<number>`(select count(*) ${scope} and ${available} between 1 and ${threshold})::int`;
  const out = sql<number>`(select count(*) ${scope} and ${available} = 0)::int`;

  const stockFilter: Record<StockState, SQL> = {
    OUT_OF_STOCK: sql`${total} = 0`,
    LOW_STOCK: sql`${total} > 0 and (${low} > 0 or ${out} > 0)`,
    IN_STOCK: sql`${total} > 0 and ${low} = 0 and ${out} = 0`,
  };
  return { total, variants, low, out, stockFilter };
}

export const statusFilter: Record<ProductStatus, SQL> = {
  ACTIVE: and(isNull(products.deletedAt), products.isActive)!,
  DRAFT: and(isNull(products.deletedAt), not(products.isActive))!,
  ARCHIVED: isNotNull(products.deletedAt),
};

export const productStatus = (p: { isActive: boolean; deletedAt: Date | null }): ProductStatus =>
  p.deletedAt ? "ARCHIVED" : p.isActive ? "ACTIVE" : "DRAFT";

export function stockState(total: number, low: number, out: number): StockState {
  if (total === 0) return "OUT_OF_STOCK";
  return low > 0 || out > 0 ? "LOW_STOCK" : "IN_STOCK";
}
