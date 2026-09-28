import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import { categories, productCategories, productImages, productVariants, products } from "../../src/db/schema";
import { applyMovement } from "../../src/modules/inventory/service";
import { deriveAttributes, slugify, tidyName, type CatalogSnapshot } from "./normalize";

/** Storefront ordering + visibility for the known WooCommerce categories. */
const CATEGORY_PRESENTATION: Record<string, { sortOrder: number; isNavigable: boolean; name?: string }> = {
  "new-arrivals": { sortOrder: 0, isNavigable: true },
  shirts: { sortOrder: 1, isNavigable: true },
  kurthas: { sortOrder: 2, isNavigable: true, name: "Kurtas" },
  ikat: { sortOrder: 3, isNavigable: true, name: "Ikat" },
  jamdani: { sortOrder: 4, isNavigable: true },
  kalamkari: { sortOrder: 5, isNavigable: true, name: "Kalamkari" },
  "linen-shirts": { sortOrder: 6, isNavigable: true },
  "printed-shirt": { sortOrder: 7, isNavigable: true, name: "Printed Shirts" },
  handloom: { sortOrder: 8, isNavigable: true },
  sale: { sortOrder: 9, isNavigable: true, name: "Clearance" },
  // Every product is menswear today, so these duplicate "Shop all".
  men: { sortOrder: 50, isNavigable: false },
  "mens-clothing": { sortOrder: 51, isNavigable: false },
  "mix-match": { sortOrder: 52, isNavigable: false },
  cotton: { sortOrder: 53, isNavigable: false, name: "Cotton" },
};

export interface ApplyOptions {
  /** Overwrite admin-edited fields (name, descriptions, attributes, prices) on existing products. */
  overwrite: boolean;
  /**
   * Called for variants whose stock is unknown in the source (Store API).
   * Returns the opening stock to record. Omit to leave stock at zero.
   */
  openingStock?: (ctx: { productIndex: number; size: string; inStock: boolean }) => number;
}

export interface ApplyReport {
  created: number;
  updated: number;
  variants: number;
  images: number;
  categories: number;
}

/**
 * Idempotently upserts a normalised snapshot. Products are matched by
 * `source_ref`, so re-running an import (or switching to the official CSV
 * export) updates rows in place instead of duplicating them.
 */
export async function applySnapshot(snapshot: CatalogSnapshot, opts: ApplyOptions): Promise<ApplyReport> {
  const report: ApplyReport = { created: 0, updated: 0, variants: 0, images: 0, categories: 0 };

  // Categories first.
  const allCats = new Map(snapshot.products.flatMap((p) => p.categories).map((c) => [c.slug, c.name]));
  const categoryIds = new Map<string, string>();
  for (const [slug, name] of allCats) {
    const pres = CATEGORY_PRESENTATION[slug] ?? { sortOrder: 20, isNavigable: true };
    const [row] = await db
      .insert(categories)
      .values({ slug, name: pres.name ?? name, sortOrder: pres.sortOrder, isNavigable: pres.isNavigable })
      .onConflictDoUpdate({ target: categories.slug, set: { sortOrder: pres.sortOrder, isNavigable: pres.isNavigable } })
      .returning({ id: categories.id });
    categoryIds.set(slug, row!.id);
    report.categories++;
  }

  const usedSkus = new Set<string>();
  const usedSlugs = new Set<string>();

  for (const [index, source] of snapshot.products.entries()) {
    const attrs = deriveAttributes(source);
    const name = tidyName(source.name);
    let sku = (source.sku ?? `WW-${source.sourceRef.replace(/\D/g, "")}`).toUpperCase();
    if (usedSkus.has(sku)) sku = `${sku}-${source.sourceRef.replace(/\D/g, "")}`;
    usedSkus.add(sku);
    let slug = source.slug || slugify(name);
    if (usedSlugs.has(slug)) slug = `${slug}-${source.sourceRef.replace(/\D/g, "")}`;
    usedSlugs.add(slug);

    const primarySlug =
      source.categories.find((c) => !["new-arrivals", "men", "mens-clothing", "sale", "mix-match", "cotton", "handloom"].includes(c.slug))
        ?.slug ?? source.categories[0]?.slug;
    const isNewArrival = source.categories.some((c) => c.slug === "new-arrivals");

    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.sourceRef, source.sourceRef));
      const editable = {
        name,
        shortDescription: source.shortDescription,
        description: source.description,
        productType: attrs.productType,
        fabric: attrs.fabric,
        pattern: attrs.pattern,
        color: attrs.color,
        tags: source.tags,
        mrpPaise: source.mrpPaise,
        pricePaise: source.pricePaise,
        // The storefront title template appends the brand.
        seoTitle: `${name} — Handwoven ${attrs.productType}`,
        seoDescription: (source.shortDescription ?? source.description ?? name).slice(0, 300),
      };

      let productId: string;
      if (existing) {
        productId = existing.id;
        await tx
          .update(products)
          .set({ ...(opts.overwrite ? editable : {}), isNewArrival, primaryCategoryId: primarySlug ? categoryIds.get(primarySlug) : null })
          .where(eq(products.id, productId));
        report.updated++;
      } else {
        const [row] = await tx
          .insert(products)
          .values({
            ...editable,
            slug,
            sku,
            sourceRef: source.sourceRef,
            // Sources list newest first and expose no dates; keep that order for "Newest" sorting.
            createdAt: new Date(Date.parse(snapshot.fetchedAt) - index * 60 * 60 * 1000),
            isNewArrival,
            isActive: true,
            primaryCategoryId: primarySlug ? categoryIds.get(primarySlug) : null,
          })
          .returning({ id: products.id });
        productId = row!.id;
        report.created++;
      }

      // Category links mirror the source exactly.
      await tx.delete(productCategories).where(eq(productCategories.productId, productId));
      const links = source.categories.map((c) => ({ productId, categoryId: categoryIds.get(c.slug)! }));
      if (links.length) await tx.insert(productCategories).values(links).onConflictDoNothing();

      // Variants: upsert by (product, size); deactivate sizes no longer offered.
      const sizes = source.variants.map((v) => v.size);
      for (const [vi, v] of source.variants.entries()) {
        const variantSku = (v.sku ?? `${sku}-${v.size}`).toUpperCase();
        const [variant] = await tx
          .insert(productVariants)
          .values({ productId, sku: variantSku, size: v.size, sortOrder: vi, sourceRef: v.sourceRef, isActive: true })
          .onConflictDoUpdate({
            target: [productVariants.productId, productVariants.size, productVariants.color],
            set: { isActive: true, sortOrder: vi },
          })
          .returning({ id: productVariants.id, createdAt: productVariants.createdAt, updatedAt: productVariants.updatedAt });
        report.variants++;

        const opening = v.stock ?? opts.openingStock?.({ productIndex: index, size: v.size, inStock: source.inStock }) ?? 0;
        const isNew = !existing;
        if (isNew && opening > 0) {
          await applyMovement(tx, variant!.id, { kind: "STOCK_IN", quantity: opening }, { note: `Opening stock (${snapshot.source})` });
        }
      }
      if (sizes.length) {
        await tx
          .update(productVariants)
          .set({ isActive: false })
          .where(and(eq(productVariants.productId, productId), notInArray(productVariants.size, sizes)));
      }

      // Images: replace imported ones (WebP files shipped with the storefront, or
      // external references until converted); keep images uploaded through the admin.
      await tx
        .delete(productImages)
        .where(and(eq(productImages.productId, productId), inArray(productImages.provider, ["external", "static"])));
      if (source.images.length) {
        await tx.insert(productImages).values(
          source.images.map((img, i) => ({
            productId,
            provider: img.localPath ? "static" : "external",
            storageKey: img.localPath ?? img.url,
            alt: img.alt || `${name} — view ${i + 1}`,
            width: img.width,
            height: img.height,
            sortOrder: i,
          })),
        );
        report.images += source.images.length;
      }
    });
  }
  return report;
}
