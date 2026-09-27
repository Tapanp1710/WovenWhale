import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ImageDTO, ProductCardDTO } from "../../contracts/dto";
import { db } from "../../db/client";
import { categories, inventory, productImages, productVariants, products } from "../../db/schema";
import { resolveImageUrl } from "../../integrations/storage";

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "FREE"];
export const sizeRank = (size: string) => {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  return i === -1 ? 100 : i;
};

export function toImageDTO(
  row: {
    id: string;
    provider: string;
    storageKey: string;
    alt: string | null;
    width: number | null;
    height: number | null;
  },
  fallbackAlt: string,
): ImageDTO {
  return {
    id: row.id,
    url: resolveImageUrl(row.provider, row.storageKey),
    alt: row.alt || fallbackAlt,
    width: row.width,
    height: row.height,
  };
}

/** Available units expression (on_hand - reserved), 0 when no inventory row exists. */
export const availableExpr = sql<number>`coalesce(${inventory.onHand} - ${inventory.reserved}, 0)`;

/**
 * Loads storefront product cards for the given ids in a fixed number of
 * queries (no N+1), preserving the input order.
 */
export async function loadProductCards(ids: string[], opts: { includeInactive?: boolean } = {}): Promise<ProductCardDTO[]> {
  if (ids.length === 0) return [];

  const [productRows, imageRows, variantRows] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        productType: products.productType,
        fabric: products.fabric,
        pattern: products.pattern,
        color: products.color,
        pricePaise: products.pricePaise,
        mrpPaise: products.mrpPaise,
        discountPercent: products.discountPercent,
        isNewArrival: products.isNewArrival,
        isBestSeller: products.isBestSeller,
        isActive: products.isActive,
        categorySlug: categories.slug,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.primaryCategoryId))
      .where(and(inArray(products.id, ids), isNull(products.deletedAt))),
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
    db
      .select({ productId: productVariants.productId, size: productVariants.size, available: availableExpr })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(inArray(productVariants.productId, ids), eq(productVariants.isActive, true))),
  ]);

  const imagesByProduct = new Map<string, typeof imageRows>();
  for (const img of imageRows) {
    const list = imagesByProduct.get(img.productId) ?? [];
    if (list.length < 2) list.push(img);
    imagesByProduct.set(img.productId, list);
  }

  const sizesByProduct = new Map<string, { size: string; inStock: boolean }[]>();
  for (const v of variantRows) {
    const list = sizesByProduct.get(v.productId) ?? [];
    const existing = list.find((s) => s.size === v.size);
    if (existing) existing.inStock ||= Number(v.available) > 0;
    else list.push({ size: v.size, inStock: Number(v.available) > 0 });
    sizesByProduct.set(v.productId, list);
  }

  const byId = new Map(productRows.map((p) => [p.id, p]));
  const cards: ProductCardDTO[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p || (!p.isActive && !opts.includeInactive)) continue;
    const sizes = (sizesByProduct.get(id) ?? []).sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
    cards.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      productType: p.productType,
      fabric: p.fabric,
      pattern: p.pattern,
      color: p.color,
      pricePaise: p.pricePaise,
      mrpPaise: p.mrpPaise,
      discountPercent: p.discountPercent ?? 0,
      images: (imagesByProduct.get(id) ?? []).map((img) => toImageDTO(img, p.name)),
      sizes,
      inStock: p.isActive && sizes.some((s) => s.inStock),
      isNewArrival: p.isNewArrival,
      isBestSeller: p.isBestSeller,
      primaryCategory: p.categorySlug ? { slug: p.categorySlug, name: p.categoryName ?? p.categorySlug } : null,
    });
  }
  return cards;
}
