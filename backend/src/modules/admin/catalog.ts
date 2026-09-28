import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import {
  categoryUpsertSchema,
  imageMetaSchema,
  imageReorderSchema,
  adminProductQuerySchema,
  listQuerySchema,
  productFlagsSchema,
  productRestoreSchema,
  productUpsertSchema,
  variantUpsertSchema,
} from "../../contracts/admin";
import type { AdminCategoryDTO, AdminProductDetailDTO, AdminProductRowDTO } from "../../contracts/dto";
import { db, type DbOrTx } from "../../db/client";
import { ref } from "../../db/sql";
import {
  categories,
  inventory,
  inventoryTransactions,
  orderItems,
  productCategories,
  productImages,
  productVariants,
  products,
} from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { providers } from "../../integrations";
import { resolveImageUrl } from "../../integrations/storage";
import { recordAudit } from "../../lib/audit";
import { randomToken } from "../../lib/crypto";
import { toWebp } from "../../lib/images";
import { HttpError, notFound, readJson, readQuery } from "../../lib/http";
import { adminOf, requirePermission } from "../auth/middleware";
import { productStatus, productStockExpressions, statusFilter, stockState } from "./product-stock";
import { sizeRank, toImageDTO } from "../catalog/cards";
import { applyMovement } from "../inventory/service";
import { getStoreSettings } from "../settings/service";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Detects the real image type from magic bytes — the declared Content-Type is not trusted. */
function sniffImage(bytes: Uint8Array): { ext: string; mime: string } | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return { ext: "avif", mime: "image/avif" };
  return null;
}

function isUniqueViolation(error: unknown): string | null {
  const cause =
    (error as { cause?: { code?: string; constraint_name?: string } }).cause ?? (error as { code?: string; constraint_name?: string });
  return cause?.code === "23505" ? (cause.constraint_name ?? "unique") : null;
}

function uniqueMessage(constraint: string) {
  if (constraint.includes("slug")) return new DomainError("SLUG_TAKEN", "That URL slug is already in use.", 409);
  if (constraint.includes("sku")) return new DomainError("SKU_TAKEN", "That SKU is already in use.", 409);
  if (constraint.includes("size_color")) return new DomainError("VARIANT_EXISTS", "This size already exists for the product.", 409);
  return new DomainError("DUPLICATE", "A record with these details already exists.", 409);
}

/** Safe to delete permanently: never ordered and no stock movements recorded. */
async function isDeletable(conn: DbOrTx, productId: string) {
  const [row] = await conn
    .select({
      used: sql<boolean>`exists (select 1 from ${orderItems} oi where oi.product_id = ${productId})
        or exists (select 1 from ${inventoryTransactions} t join ${productVariants} v on v.id = t.variant_id where v.product_id = ${productId})`,
    })
    .from(products)
    .where(eq(products.id, productId));
  return row ? !row.used : false;
}

async function productDetail(id: string): Promise<AdminProductDetailDTO> {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) throw notFound("Product");
  const settings = await getStoreSettings();
  const [images, variants, cats, deletable] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
    db
      .select({ v: productVariants, onHand: inventory.onHand, reserved: inventory.reserved, threshold: inventory.lowStockThreshold })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, id)),
    db.select({ id: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, id)),
    isDeletable(db, id),
  ]);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    shortDescription: p.shortDescription,
    description: p.description,
    productType: p.productType,
    fabric: p.fabric,
    pattern: p.pattern,
    color: p.color,
    tags: p.tags,
    mrpPaise: p.mrpPaise,
    pricePaise: p.pricePaise,
    categoryIds: cats.map((c) => c.id),
    primaryCategoryId: p.primaryCategoryId,
    isFeatured: p.isFeatured,
    isBestSeller: p.isBestSeller,
    isNewArrival: p.isNewArrival,
    isActive: p.isActive,
    status: productStatus(p),
    archivedAt: p.deletedAt?.toISOString() ?? null,
    deletable,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    images: images.map((img) => ({ ...toImageDTO(img, p.name), provider: img.provider, sortOrder: img.sortOrder })),
    variants: variants
      .map(({ v, onHand, reserved, threshold }) => {
        const available = Math.max(0, (onHand ?? 0) - (reserved ?? 0));
        return {
          id: v.id,
          sku: v.sku,
          size: v.size,
          color: v.color,
          pricePaise: v.pricePaise ?? p.pricePaise,
          mrpPaise: v.mrpPaise ?? p.mrpPaise,
          pricePaiseOverride: v.pricePaise,
          mrpPaiseOverride: v.mrpPaise,
          available,
          inStock: available > 0,
          lowStock: available > 0 && available <= (threshold ?? settings.lowStockThreshold),
          isActive: v.isActive,
          onHand: onHand ?? 0,
          reserved: reserved ?? 0,
          sortOrder: v.sortOrder,
          lowStockThreshold: threshold ?? settings.lowStockThreshold,
        };
      })
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size)),
  };
}

export const adminCatalogRoutes = new Hono<AppEnv>()
  /* ─────────────────────────────── Products ─────────────────────────────── */
  .get("/products", requirePermission("products.view"), async (c) => {
    const q = readQuery(c, adminProductQuerySchema);
    const settings = await getStoreSettings();
    const stock = productStockExpressions(settings.lowStockThreshold);
    const conds: SQL[] = [q.status ? statusFilter[q.status] : isNull(products.deletedAt)];
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      conds.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.slug, like))!);
    }
    if (q.category) {
      conds.push(
        sql`exists (select 1 from ${productCategories} pc where pc.product_id = ${ref(products.id)} and pc.category_id = ${q.category})`,
      );
    }
    if (q.stock) conds.push(stock.stockFilter[q.stock]);
    const where = and(...conds);
    const order = {
      updated: [desc(products.updatedAt)],
      name: [asc(products.name)],
      "price-asc": [asc(products.pricePaise)],
      "price-desc": [desc(products.pricePaise)],
      "stock-asc": [asc(stock.total), asc(products.name)],
      "stock-desc": [desc(stock.total), asc(products.name)],
    }[q.sort];
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({
          p: products,
          totalStock: stock.total,
          variantCount: stock.variants,
          lowVariants: stock.low,
          outVariants: stock.out,
          imageProvider: sql<
            string | null
          >`(select provider from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
          imageKey: sql<
            string | null
          >`(select storage_key from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
          categories: sql<
            string[]
          >`coalesce((select array_agg(c.name order by c.sort_order) from ${productCategories} pc join ${categories} c on c.id = pc.category_id where pc.product_id = ${ref(products.id)}), '{}')`,
        })
        .from(products)
        .where(where)
        .orderBy(...order)
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(products)
        .where(where),
    ]);
    const items: AdminProductRowDTO[] = rows.map((r) => ({
      id: r.p.id,
      name: r.p.name,
      slug: r.p.slug,
      sku: r.p.sku,
      imageUrl: r.imageProvider && r.imageKey ? resolveImageUrl(r.imageProvider, r.imageKey) : null,
      pricePaise: r.p.pricePaise,
      mrpPaise: r.p.mrpPaise,
      discountPercent: r.p.discountPercent ?? 0,
      isActive: r.p.isActive,
      isFeatured: r.p.isFeatured,
      isBestSeller: r.p.isBestSeller,
      isNewArrival: r.p.isNewArrival,
      totalStock: Number(r.totalStock),
      variantCount: Number(r.variantCount),
      lowVariants: Number(r.lowVariants),
      outVariants: Number(r.outVariants),
      status: productStatus(r.p),
      stockState: stockState(Number(r.totalStock), Number(r.lowVariants), Number(r.outVariants)),
      categories: r.categories ?? [],
      updatedAt: r.p.updatedAt.toISOString(),
    }));
    return c.json({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    });
  })
  .get("/products/:id", requirePermission("products.view"), async (c) => c.json(await productDetail(c.req.param("id"))))
  .post("/products", requirePermission("products.manage"), async (c) => {
    const input = await readJson(c, productUpsertSchema);
    const admin = adminOf(c);
    const { categoryIds, mrp, price, ...fields } = input;
    try {
      const id = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(products)
          .values({ ...fields, mrpPaise: mrp, pricePaise: price, primaryCategoryId: input.primaryCategoryId ?? categoryIds[0] })
          .returning();
        await tx.insert(productCategories).values(categoryIds.map((categoryId) => ({ productId: created!.id, categoryId })));
        await recordAudit(tx, admin, { action: "product.created", entityType: "product", entityId: created!.id, after: created });
        return created!.id;
      });
      return c.json(await productDetail(id), 201);
    } catch (error) {
      const constraint = isUniqueViolation(error);
      if (constraint) throw uniqueMessage(constraint);
      throw error;
    }
  })
  .put("/products/:id", requirePermission("products.manage"), async (c) => {
    const input = await readJson(c, productUpsertSchema);
    const admin = adminOf(c);
    const id = c.req.param("id");
    const { categoryIds, mrp, price, ...fields } = input;
    try {
      await db.transaction(async (tx) => {
        const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
        if (!before) throw notFound("Product");
        if (before.deletedAt) throw new DomainError("PRODUCT_ARCHIVED", "Restore this product before editing it.", 409);
        const [after] = await tx
          .update(products)
          .set({ ...fields, mrpPaise: mrp, pricePaise: price, primaryCategoryId: input.primaryCategoryId ?? categoryIds[0] })
          .where(eq(products.id, id))
          .returning();
        await tx.delete(productCategories).where(eq(productCategories.productId, id));
        await tx.insert(productCategories).values(categoryIds.map((categoryId) => ({ productId: id, categoryId })));
        const priceChanged = before.pricePaise !== price || before.mrpPaise !== mrp;
        await recordAudit(tx, admin, {
          action: priceChanged ? "product.price_changed" : "product.updated",
          entityType: "product",
          entityId: id,
          before,
          after,
        });
      });
    } catch (error) {
      const constraint = isUniqueViolation(error);
      if (constraint) throw uniqueMessage(constraint);
      throw error;
    }
    return c.json(await productDetail(id));
  })
  .patch("/products/:id/status", requirePermission("products.manage"), async (c) => {
    const flags = await readJson(c, productFlagsSchema);
    const admin = adminOf(c);
    const id = c.req.param("id");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, id));
      if (!before) throw notFound("Product");
      const [after] = await tx.update(products).set(flags).where(eq(products.id, id)).returning();
      await recordAudit(tx, admin, { action: "product.status_changed", entityType: "product", entityId: id, before, after });
    });
    return c.json(await productDetail(id));
  })
  /** Archive: hidden from the store, kept for order history; slug and SKU stay reserved. */
  .post("/products/:id/archive", requirePermission("products.manage"), async (c) => {
    const admin = adminOf(c);
    const id = c.req.param("id");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!before) throw notFound("Product");
      if (before.deletedAt) throw new DomainError("ALREADY_ARCHIVED", "This product is already archived.", 409);
      await tx.update(products).set({ isActive: false, deletedAt: new Date() }).where(eq(products.id, id));
      await recordAudit(tx, admin, {
        action: "product.archived",
        entityType: "product",
        entityId: id,
        before: { status: productStatus(before) },
        after: { status: "ARCHIVED" },
      });
    });
    return c.json(await productDetail(id));
  })
  /** Restore an archived product as a draft, or straight to active when it's complete enough to sell. */
  .post("/products/:id/restore", requirePermission("products.manage"), async (c) => {
    const { to } = await readJson(c, productRestoreSchema);
    const admin = adminOf(c);
    const id = c.req.param("id");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!before) throw notFound("Product");
      if (!before.deletedAt) throw new DomainError("NOT_ARCHIVED", "Only archived products can be restored.", 409);
      if (to === "ACTIVE") {
        const [readiness] = await tx
          .select({
            variants: sql<number>`(select count(*) from ${productVariants} v where v.product_id = ${id} and v.is_active)::int`,
            images: sql<number>`(select count(*) from ${productImages} pi where pi.product_id = ${id})::int`,
          })
          .from(products)
          .where(eq(products.id, id));
        if (!Number(readiness?.variants) || !Number(readiness?.images) || before.pricePaise <= 0) {
          throw new DomainError(
            "NOT_READY_TO_SELL",
            "This product needs a price, at least one active size and an image before it can go live. Restore it as a draft and complete it first.",
            409,
          );
        }
      }
      await tx
        .update(products)
        .set({ deletedAt: null, isActive: to === "ACTIVE" })
        .where(eq(products.id, id));
      await recordAudit(tx, admin, {
        action: "product.restored",
        entityType: "product",
        entityId: id,
        before: { status: "ARCHIVED" },
        after: { status: to },
      });
    });
    return c.json(await productDetail(id));
  })
  /**
   * Permanent delete, only for an archived product nothing refers to: no
   * order lines and no stock movements (the ledger is append-only). Anything
   * else stays archived.
   */
  .delete("/products/:id", requirePermission("products.manage"), async (c) => {
    const admin = adminOf(c);
    const id = c.req.param("id");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!before) throw notFound("Product");
      if (!before.deletedAt) throw new DomainError("ARCHIVE_FIRST", "Archive the product before deleting it.", 409);
      if (!(await isDeletable(tx, id))) {
        throw new DomainError("PRODUCT_IN_USE", "This product has orders or stock history, so it can only be archived.", 409);
      }
      await tx.delete(products).where(eq(products.id, id));
      await recordAudit(tx, admin, {
        action: "product.deleted",
        entityType: "product",
        entityId: id,
        before: { name: before.name, sku: before.sku, slug: before.slug },
      });
    });
    return c.json({ ok: true });
  })

  /* ─────────────────────────────── Variants ─────────────────────────────── */
  .post("/products/:id/variants", requirePermission("products.manage"), async (c) => {
    const input = await readJson(c, variantUpsertSchema);
    const admin = adminOf(c);
    const productId = c.req.param("id");
    try {
      await db.transaction(async (tx) => {
        const [variant] = await tx
          .insert(productVariants)
          .values({
            productId,
            size: input.size,
            color: input.color ?? null,
            sku: input.sku,
            pricePaise: input.price ?? null,
            mrpPaise: input.mrp ?? null,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
          })
          .returning();
        if (input.initialStock) {
          await applyMovement(
            tx,
            variant!.id,
            { kind: "STOCK_IN", quantity: input.initialStock },
            { adminUserId: admin.id, note: "Opening stock" },
          );
        }
        await recordAudit(tx, admin, {
          action: "variant.created",
          entityType: "product",
          entityId: productId,
          after: { ...variant, initialStock: input.initialStock ?? 0 },
        });
      });
    } catch (error) {
      const constraint = isUniqueViolation(error);
      if (constraint) throw uniqueMessage(constraint);
      throw error;
    }
    return c.json(await productDetail(productId), 201);
  })
  .put("/variants/:id", requirePermission("products.manage"), async (c) => {
    const { initialStock: _ignored, ...input } = await readJson(c, variantUpsertSchema);
    const admin = adminOf(c);
    let productId = "";
    try {
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, c.req.param("id")));
        if (!before) throw notFound("Variant");
        productId = before.productId;
        const [after] = await tx
          .update(productVariants)
          .set({
            size: input.size,
            color: input.color ?? null,
            sku: input.sku,
            pricePaise: input.price ?? null,
            mrpPaise: input.mrp ?? null,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
          })
          .where(eq(productVariants.id, before.id))
          .returning();
        const priceChanged = before.pricePaise !== after!.pricePaise || before.mrpPaise !== after!.mrpPaise;
        await recordAudit(tx, admin, {
          action: before.isActive && !after!.isActive ? "variant.archived" : priceChanged ? "variant.price_changed" : "variant.updated",
          entityType: "product",
          entityId: before.productId,
          before,
          after,
        });
      });
    } catch (error) {
      const constraint = isUniqueViolation(error);
      if (constraint) throw uniqueMessage(constraint);
      throw error;
    }
    return c.json(await productDetail(productId));
  })

  /* ──────────────────────────────── Images ──────────────────────────────── */
  .post("/products/:id/images", requirePermission("products.manage"), async (c) => {
    const productId = c.req.param("id");
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new HttpError(400, "FILE_REQUIRED", "Choose an image to upload.");
    if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "Images must be 8 MB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) throw new HttpError(415, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG, WebP or AVIF image.");

    const [product] = await db
      .select({ id: products.id, slug: products.slug, name: products.name })
      .from(products)
      .where(eq(products.id, productId));
    if (!product) throw notFound("Product");
    // Stored as WebP whatever the upload format; the magic-byte check above rejects non-images first.
    const webp = await toWebp(bytes).catch(() => {
      throw new HttpError(415, "UNSUPPORTED_IMAGE", "This image couldn't be read. Upload a JPEG, PNG, WebP or AVIF image.");
    });
    const key = `products/${product.slug}/${randomToken(9)}.webp`;
    await providers.storage.upload(key, webp.data, "image/webp");
    const [{ next } = { next: 0 }] = await db
      .select({ next: sql<number>`coalesce(max(${productImages.sortOrder}) + 1, 0)::int` })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    await db.transaction(async (tx) => {
      const [image] = await tx
        .insert(productImages)
        .values({
          productId,
          provider: providers.storage.name,
          storageKey: key,
          alt: typeof body.alt === "string" ? body.alt.slice(0, 200) : product.name,
          width: webp.width,
          height: webp.height,
          sortOrder: Number(next),
        })
        .returning();
      await recordAudit(tx, adminOf(c), {
        action: "product.image_added",
        entityType: "product",
        entityId: productId,
        after: { imageId: image!.id, key },
      });
    });
    return c.json(await productDetail(productId), 201);
  })
  .patch("/images/:imageId", requirePermission("products.manage"), async (c) => {
    const { alt } = await readJson(c, imageMetaSchema);
    const [image] = await db
      .update(productImages)
      .set({ alt })
      .where(eq(productImages.id, c.req.param("imageId")))
      .returning();
    if (!image) throw notFound("Image");
    return c.json(await productDetail(image.productId));
  })
  .put("/products/:id/images/order", requirePermission("products.manage"), async (c) => {
    const { imageIds } = await readJson(c, imageReorderSchema);
    const productId = c.req.param("id");
    await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(and(eq(productImages.productId, productId), inArray(productImages.id, imageIds)));
      if (owned.length !== imageIds.length) throw new DomainError("INVALID_IMAGES", "Images don't belong to this product.", 422);
      for (const [i, id] of imageIds.entries()) await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, id));
    });
    return c.json(await productDetail(productId));
  })
  .delete("/images/:imageId", requirePermission("products.manage"), async (c) => {
    const [image] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.id, c.req.param("imageId")));
    if (!image) throw notFound("Image");
    await db.transaction(async (tx) => {
      await tx.delete(productImages).where(eq(productImages.id, image.id));
      await recordAudit(tx, adminOf(c), {
        action: "product.image_removed",
        entityType: "product",
        entityId: image.productId,
        before: { imageId: image.id, key: image.storageKey },
      });
    });
    if (image.provider === providers.storage.name) await providers.storage.delete(image.storageKey);
    return c.json(await productDetail(image.productId));
  })

  /* ────────────────────────────── Categories ────────────────────────────── */
  .get("/categories", requirePermission("products.view"), async (c) => {
    const rows = await db
      .select({
        c: categories,
        productCount: sql<number>`(select count(*) from ${productCategories} pc join ${products} p on p.id = pc.product_id where pc.category_id = ${ref(categories.id)} and p.deleted_at is null)::int`,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const list: AdminCategoryDTO[] = rows.map(({ c: cat, productCount }) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
      seoTitle: cat.seoTitle,
      seoDescription: cat.seoDescription,
      productCount: Number(productCount),
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      isNavigable: cat.isNavigable,
    }));
    return c.json(list);
  })
  .post("/categories", requirePermission("products.manage"), async (c) => {
    const input = await readJson(c, categoryUpsertSchema);
    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(categories).values(input).returning();
        await recordAudit(tx, adminOf(c), { action: "category.created", entityType: "category", entityId: row!.id, after: row });
        return row!;
      });
      return c.json(created, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError("SLUG_TAKEN", "That URL slug is already in use.", 409);
      throw error;
    }
  })
  .put("/categories/:id", requirePermission("products.manage"), async (c) => {
    const input = await readJson(c, categoryUpsertSchema);
    try {
      const updated = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, c.req.param("id")));
        if (!before) throw notFound("Category");
        const [after] = await tx.update(categories).set(input).where(eq(categories.id, before.id)).returning();
        await recordAudit(tx, adminOf(c), { action: "category.updated", entityType: "category", entityId: before.id, before, after });
        return after!;
      });
      return c.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError("SLUG_TAKEN", "That URL slug is already in use.", 409);
      throw error;
    }
  });
