import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import type { WishlistItemDTO } from "../../contracts/dto";
import { moveToCartSchema, wishlistAddSchema } from "../../contracts/storefront";
import { db } from "../../db/client";
import { productVariants, products, wishlistItems, wishlists } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { readJson } from "../../lib/http";
import { customerOf, requireCustomer } from "../auth/middleware";
import { addItem } from "../cart/service";
import { loadProductCards } from "../catalog/cards";

async function wishlistId(userId: string) {
  const [existing] = await db.select({ id: wishlists.id }).from(wishlists).where(eq(wishlists.userId, userId));
  if (existing) return existing.id;
  const [created] = await db.insert(wishlists).values({ userId }).onConflictDoNothing().returning({ id: wishlists.id });
  return created?.id ?? (await db.select({ id: wishlists.id }).from(wishlists).where(eq(wishlists.userId, userId)))[0]!.id;
}

export async function listWishlist(userId: string): Promise<WishlistItemDTO[]> {
  const id = await wishlistId(userId);
  const rows = await db
    .select({ productId: wishlistItems.productId, createdAt: wishlistItems.createdAt })
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, id))
    .orderBy(desc(wishlistItems.createdAt));
  const cards = new Map(
    (
      await loadProductCards(
        rows.map((r) => r.productId),
        { includeInactive: true },
      )
    ).map((c) => [c.id, c]),
  );
  return rows
    .filter((r) => cards.has(r.productId))
    .map((r) => ({ productId: r.productId, addedAt: r.createdAt.toISOString(), product: cards.get(r.productId)! }));
}

export const wishlistRoutes = new Hono<AppEnv>()
  .use(requireCustomer)
  .get("/", async (c) => c.json(await listWishlist(customerOf(c).id)))
  .get("/ids", async (c) => {
    const id = await wishlistId(customerOf(c).id);
    const rows = await db.select({ productId: wishlistItems.productId }).from(wishlistItems).where(eq(wishlistItems.wishlistId, id));
    return c.json(rows.map((r) => r.productId));
  })
  .post("/items", async (c) => {
    const { productId } = await readJson(c, wishlistAddSchema);
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
    if (!product) throw new DomainError("PRODUCT_UNAVAILABLE", "This product is no longer available.", 404);
    await db
      .insert(wishlistItems)
      .values({ wishlistId: await wishlistId(customerOf(c).id), productId })
      .onConflictDoNothing();
    return c.json({ ok: true }, 201);
  })
  .delete("/items/:productId", async (c) => {
    const id = await wishlistId(customerOf(c).id);
    await db.delete(wishlistItems).where(and(eq(wishlistItems.wishlistId, id), eq(wishlistItems.productId, c.req.param("productId"))));
    return c.json({ ok: true });
  })
  .post("/items/:productId/move-to-cart", async (c) => {
    const { variantId } = await readJson(c, moveToCartSchema);
    const userId = customerOf(c).id;
    const [variant] = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    if (variant?.productId !== c.req.param("productId")) {
      throw new DomainError("VARIANT_MISMATCH", "Please choose a size for this product.", 422);
    }
    await addItem({ userId }, variantId, 1, c.get("visitorId"));
    const id = await wishlistId(userId);
    await db.delete(wishlistItems).where(and(eq(wishlistItems.wishlistId, id), eq(wishlistItems.productId, variant.productId)));
    return c.json(await listWishlist(userId));
  });
