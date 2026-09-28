import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { inventoryAdjustSchema, inventoryQuerySchema } from "../../contracts/admin";
import type { InventoryRowDTO, InventoryTxnDTO, LowStockRowDTO } from "../../contracts/dto";
import { db } from "../../db/client";
import { ref } from "../../db/sql";
import { adminUsers, inventory, inventoryTransactions, orders, productImages, productVariants, products } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { recordAudit } from "../../lib/audit";
import { notFound, readJson, readQuery } from "../../lib/http";
import { resolveImageUrl } from "../../integrations/storage";
import { adminOf, requirePermission } from "../auth/middleware";
import { applyMovement } from "../inventory/service";

const available = sql<number>`(coalesce(${inventory.onHand}, 0) - coalesce(${inventory.reserved}, 0))::int`;
const threshold = sql<number>`coalesce(${inventory.lowStockThreshold}, 3)::int`;
/** Running low but still sellable; sold-out variants are tracked separately. */
const isLow = sql`${available} > 0 and ${available} <= ${threshold}`;

export async function lowStockRows(limit = 20): Promise<LowStockRowDTO[]> {
  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      sku: productVariants.sku,
      size: productVariants.size,
      onHand: sql<number>`coalesce(${inventory.onHand}, 0)::int`,
      reserved: sql<number>`coalesce(${inventory.reserved}, 0)::int`,
      available,
      lowStockThreshold: threshold,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(productVariants.isActive, true), eq(products.isActive, true), isNull(products.deletedAt), isLow))
    .orderBy(asc(available), asc(products.name))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    onHand: Number(r.onHand),
    reserved: Number(r.reserved),
    available: Number(r.available),
    lowStockThreshold: Number(r.lowStockThreshold),
  }));
}

export const adminInventoryRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("inventory.view"), async (c) => {
    const q = readQuery(c, inventoryQuerySchema);
    const conds: SQL[] = [isNull(products.deletedAt)];
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      conds.push(or(ilike(products.name, like), ilike(productVariants.sku, like))!);
    }
    if (q.lowStock === "true") conds.push(isLow);
    const where = and(...conds);
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({
          variantId: productVariants.id,
          productId: products.id,
          productName: products.name,
          sku: productVariants.sku,
          size: productVariants.size,
          onHand: sql<number>`coalesce(${inventory.onHand}, 0)::int`,
          reserved: sql<number>`coalesce(${inventory.reserved}, 0)::int`,
          available,
          lowStockThreshold: threshold,
          isActive: sql<boolean>`${productVariants.isActive} and ${products.isActive}`,
          imageProvider: sql<
            string | null
          >`(select provider from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
          imageKey: sql<
            string | null
          >`(select storage_key from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(where)
        .orderBy(asc(products.name), asc(productVariants.sortOrder))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(where),
    ]);
    const items: InventoryRowDTO[] = rows.map(({ imageProvider, imageKey, ...r }) => ({
      ...r,
      onHand: Number(r.onHand),
      reserved: Number(r.reserved),
      available: Number(r.available),
      lowStockThreshold: Number(r.lowStockThreshold),
      imageUrl: imageProvider && imageKey ? resolveImageUrl(imageProvider, imageKey) : null,
    }));
    return c.json({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    });
  })
  .get("/low-stock", requirePermission("inventory.view"), async (c) => c.json(await lowStockRows(100)))
  .get("/:variantId/transactions", requirePermission("inventory.view"), async (c) => {
    const rows = await db
      .select({ t: inventoryTransactions, orderNumber: orders.orderNumber, actor: adminUsers.email })
      .from(inventoryTransactions)
      .leftJoin(orders, eq(orders.id, inventoryTransactions.orderId))
      .leftJoin(adminUsers, eq(adminUsers.id, inventoryTransactions.adminUserId))
      .where(eq(inventoryTransactions.variantId, c.req.param("variantId")))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(200);
    const list: InventoryTxnDTO[] = rows.map(({ t, orderNumber, actor }) => ({
      id: t.id,
      type: t.type,
      onHandDelta: t.onHandDelta,
      reservedDelta: t.reservedDelta,
      onHandAfter: t.onHandAfter,
      reservedAfter: t.reservedAfter,
      orderNumber,
      note: t.note,
      actor,
      createdAt: t.createdAt.toISOString(),
    }));
    return c.json(list);
  })
  .post("/:variantId/adjust", requirePermission("inventory.manage"), async (c) => {
    const input = await readJson(c, inventoryAdjustSchema);
    const admin = adminOf(c);
    const variantId = c.req.param("variantId");
    const [variant] = await db
      .select({ id: productVariants.id, productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    if (!variant) throw notFound("Variant");
    const result = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(inventory).where(eq(inventory.variantId, variantId));
      const after = await applyMovement(
        tx,
        variantId,
        input.type === "STOCK_IN"
          ? { kind: "STOCK_IN", quantity: input.quantity }
          : { kind: "ADJUST", delta: input.quantity, type: input.type },
        { adminUserId: admin.id, note: input.note },
      ).catch((error: unknown) => {
        if (error instanceof DomainError && error.code === "INSUFFICIENT_STOCK") {
          throw new DomainError("INSUFFICIENT_STOCK", "Insufficient stock.", 409);
        }
        throw error;
      });
      if (input.lowStockThreshold !== undefined) {
        await tx.update(inventory).set({ lowStockThreshold: input.lowStockThreshold }).where(eq(inventory.variantId, variantId));
      }
      await recordAudit(tx, admin, {
        action: input.type === "STOCK_IN" ? "inventory.restocked" : "inventory.adjusted",
        entityType: "variant",
        entityId: variantId,
        before: { onHand: before?.onHand ?? 0, reserved: before?.reserved ?? 0, lowStockThreshold: before?.lowStockThreshold ?? 3 },
        after: {
          ...after,
          lowStockThreshold: input.lowStockThreshold ?? before?.lowStockThreshold ?? 3,
          type: input.type,
          note: input.note,
          productId: variant.productId,
        },
      });
      return after;
    });
    return c.json(result);
  });
