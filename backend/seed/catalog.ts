/**
 * DEV SEED — loads the real WovenWhale catalog snapshot (names, prices,
 * images, sizes from wovenwhale.com) and assigns DEMO stock levels and DEMO
 * merchandising flags. Stock and flags are illustrative only.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { inventory, productVariants, products } from "../src/db/schema";
import { applySnapshot } from "../scripts/catalog/apply";
import type { CatalogSnapshot } from "../scripts/catalog/normalize";
import type { Random } from "./random";

const SIZE_STOCK: Record<string, number> = { XS: 2, S: 5, M: 12, L: 10, XL: 6, XXL: 3 };

export async function seedCatalog(random: Random) {
  const snapshot = JSON.parse(
    await readFile(fileURLToPath(new URL("./data/catalog.snapshot.json", import.meta.url)), "utf8"),
  ) as CatalogSnapshot;

  const report = await applySnapshot(snapshot, {
    overwrite: true,
    openingStock: ({ size, inStock }) => (inStock ? Math.max(1, (SIZE_STOCK[size] ?? 4) + random.int(-2, 4)) : 0),
  });

  // Demo low-stock signals for the admin dashboard.
  const lowStock = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(productVariants.size, "XL"), sql`${inventory.onHand} > 2`))
    .limit(5);
  if (lowStock.length) {
    await db
      .update(inventory)
      .set({ onHand: 2 })
      .where(
        inArray(
          inventory.variantId,
          lowStock.map((v) => v.id),
        ),
      );
  }

  // Demo merchandising: newest in-stock arrivals are featured; a few established styles are best sellers.
  const inStock = sql`exists (select 1 from ${productVariants} v join ${inventory} i on i.variant_id = v.id
    where v.product_id = ${products.id} and i.on_hand - i.reserved > 0)`;
  const newest = await db.select({ id: products.id }).from(products).where(inStock).orderBy(desc(products.createdAt)).limit(40);
  const featured = newest
    .filter((_, i) => i % 3 === 0)
    .slice(0, 8)
    .map((p) => p.id);
  const best = newest
    .filter((_, i) => i % 4 === 1)
    .slice(0, 8)
    .map((p) => p.id);
  await db.update(products).set({ isFeatured: true }).where(inArray(products.id, featured));
  await db.update(products).set({ isBestSeller: true }).where(inArray(products.id, best));

  return report;
}
