import { desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";
import type { AppEnv } from "../../app-env";
import { couponUpsertSchema } from "../../contracts/admin";
import type { AdminCouponDTO } from "../../contracts/dto";
import { db, type Tx } from "../../db/client";
import { ref } from "../../db/sql";
import { couponCategories, couponProducts, couponUsage, coupons } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { recordAudit } from "../../lib/audit";
import { notFound, readJson } from "../../lib/http";
import { adminOf, requirePermission } from "../auth/middleware";

async function couponDTOs(ids?: string[]): Promise<AdminCouponDTO[]> {
  const rows = await db
    .select({
      c: coupons,
      totalDiscount: sql<number>`coalesce((select sum(${couponUsage.discountPaise}) from ${couponUsage} where ${couponUsage.couponId} = ${ref(coupons.id)}), 0)::int`,
    })
    .from(coupons)
    .where(ids ? inArray(coupons.id, ids) : undefined)
    .orderBy(desc(coupons.createdAt));
  const all = rows.map((r) => r.c.id);
  const [prods, cats] = all.length
    ? await Promise.all([
        db.select().from(couponProducts).where(inArray(couponProducts.couponId, all)),
        db.select().from(couponCategories).where(inArray(couponCategories.couponId, all)),
      ])
    : [[], []];
  return rows.map(({ c, totalDiscount }) => ({
    id: c.id,
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.value,
    minOrderPaise: c.minOrderPaise,
    maxDiscountPaise: c.maxDiscountPaise,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    perCustomerLimit: c.perCustomerLimit,
    isActive: c.isActive,
    newCustomersOnly: c.newCustomersOnly,
    firstOrderOnly: c.firstOrderOnly,
    isStackable: c.isStackable,
    productIds: prods.filter((p) => p.couponId === c.id).map((p) => p.productId),
    categoryIds: cats.filter((x) => x.couponId === c.id).map((x) => x.categoryId),
    totalDiscountPaise: Number(totalDiscount),
    createdAt: c.createdAt.toISOString(),
  }));
}

function toRow(input: z.output<typeof couponUpsertSchema>) {
  return {
    code: input.code,
    description: input.description ?? null,
    type: input.type,
    // FIXED_AMOUNT is entered in rupees and stored in paise.
    value: input.type === "FIXED_AMOUNT" ? Math.round(input.value * 100) : input.value,
    minOrderPaise: input.minOrder,
    maxDiscountPaise: input.maxDiscount ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: input.usageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    isActive: input.isActive,
    newCustomersOnly: input.newCustomersOnly,
    firstOrderOnly: input.firstOrderOnly,
    isStackable: input.isStackable,
  };
}

async function setScope(tx: Tx, couponId: string, input: z.output<typeof couponUpsertSchema>) {
  await tx.delete(couponProducts).where(eq(couponProducts.couponId, couponId));
  await tx.delete(couponCategories).where(eq(couponCategories.couponId, couponId));
  if (input.productIds.length) await tx.insert(couponProducts).values(input.productIds.map((productId) => ({ couponId, productId })));
  if (input.categoryIds.length) await tx.insert(couponCategories).values(input.categoryIds.map((categoryId) => ({ couponId, categoryId })));
}

const duplicateCode = (error: unknown) =>
  ((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code) === "23505";

export const adminCouponRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("coupons.view", "coupons.manage"), async (c) => c.json(await couponDTOs()))
  .get("/:id", requirePermission("coupons.view", "coupons.manage"), async (c) => {
    const [coupon] = await couponDTOs([c.req.param("id")]);
    if (!coupon) throw notFound("Coupon");
    return c.json(coupon);
  })
  .post("/", requirePermission("coupons.manage"), async (c) => {
    const input = await readJson(c, couponUpsertSchema);
    try {
      const id = await db.transaction(async (tx) => {
        const [created] = await tx.insert(coupons).values(toRow(input)).returning();
        await setScope(tx, created!.id, input);
        await recordAudit(tx, adminOf(c), {
          action: "coupon.created",
          entityType: "coupon",
          entityId: created!.id,
          after: { ...created, productIds: input.productIds, categoryIds: input.categoryIds },
        });
        return created!.id;
      });
      return c.json((await couponDTOs([id]))[0], 201);
    } catch (error) {
      if (duplicateCode(error)) throw new DomainError("COUPON_CODE_TAKEN", "A coupon with this code already exists.", 409);
      throw error;
    }
  })
  .put("/:id", requirePermission("coupons.manage"), async (c) => {
    const input = await readJson(c, couponUpsertSchema);
    const id = c.req.param("id");
    try {
      await db.transaction(async (tx) => {
        const [before] = await tx.select().from(coupons).where(eq(coupons.id, id)).for("update");
        if (!before) throw notFound("Coupon");
        const row = toRow(input);
        if (row.usageLimit !== null && row.usageLimit < before.usedCount) {
          throw new DomainError("USAGE_LIMIT_TOO_LOW", `This coupon has already been used ${before.usedCount} times.`, 422);
        }
        const [after] = await tx.update(coupons).set(row).where(eq(coupons.id, id)).returning();
        await setScope(tx, id, input);
        await recordAudit(tx, adminOf(c), { action: "coupon.updated", entityType: "coupon", entityId: id, before, after });
      });
    } catch (error) {
      if (duplicateCode(error)) throw new DomainError("COUPON_CODE_TAKEN", "A coupon with this code already exists.", 409);
      throw error;
    }
    return c.json((await couponDTOs([id]))[0]);
  });
