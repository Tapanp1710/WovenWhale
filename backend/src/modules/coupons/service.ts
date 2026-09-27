import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "../../db/client";
import { couponCategories, couponProducts, couponUsage, coupons, orders, users } from "../../db/schema";
import type { CouponCustomerContext, CouponRule } from "../../domain/coupons";
import { normalizeCouponCode } from "../../domain/coupons";
import { DomainError } from "../../domain/errors";
import type { AppliedCoupon } from "../../domain/pricing";

/** Loads coupon rules by code, preserving the requested order. Unknown codes are returned separately. */
export async function loadCouponRules(db: DbOrTx, codes: string[], opts: { lock?: boolean } = {}) {
  const wanted = [...new Set(codes.map(normalizeCouponCode))];
  if (wanted.length === 0) return { rules: [] as CouponRule[], unknown: [] as string[] };

  const base = db
    .select()
    .from(coupons)
    .where(inArray(sql`upper(${coupons.code})`, wanted));
  // Lock coupon rows during order placement so usage limits cannot be raced.
  const rows = opts.lock ? await base.for("update") : await base;

  const ids = rows.map((r) => r.id);
  const [prodRows, catRows] = ids.length
    ? await Promise.all([
        db.select().from(couponProducts).where(inArray(couponProducts.couponId, ids)),
        db.select().from(couponCategories).where(inArray(couponCategories.couponId, ids)),
      ])
    : [[], []];

  const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  const rules: CouponRule[] = [];
  const unknown: string[] = [];
  for (const code of wanted) {
    const r = byCode.get(code);
    if (!r) {
      unknown.push(code);
      continue;
    }
    rules.push({
      id: r.id,
      code: r.code.toUpperCase(),
      type: r.type,
      value: r.value,
      minOrderPaise: r.minOrderPaise,
      maxDiscountPaise: r.maxDiscountPaise,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      usageLimit: r.usageLimit,
      usedCount: r.usedCount,
      perCustomerLimit: r.perCustomerLimit,
      isActive: r.isActive,
      newCustomersOnly: r.newCustomersOnly,
      firstOrderOnly: r.firstOrderOnly,
      isStackable: r.isStackable,
      productIds: prodRows.filter((p) => p.couponId === r.id).map((p) => p.productId),
      categoryIds: catRows.filter((c) => c.couponId === r.id).map((c) => c.categoryId),
    });
  }
  return { rules, unknown };
}

export async function loadCustomerCouponContext(db: DbOrTx, userId: string | null, couponIds: string[]): Promise<CouponCustomerContext> {
  if (!userId) return { customerId: null, accountCreatedAt: null, priorOrderCount: 0, usageByCoupon: {} };
  const [[user], [prior], usage] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.userId, userId), notInArray(orders.status, ["CANCELLED", "REJECTED"]))),
    couponIds.length
      ? db
          .select({ couponId: couponUsage.couponId, n: sql<number>`count(*)::int` })
          .from(couponUsage)
          .where(and(eq(couponUsage.userId, userId), inArray(couponUsage.couponId, couponIds)))
          .groupBy(couponUsage.couponId)
      : Promise.resolve([]),
  ]);
  return {
    customerId: userId,
    accountCreatedAt: user?.createdAt ?? null,
    priorOrderCount: Number(prior?.n ?? 0),
    usageByCoupon: Object.fromEntries(usage.map((u) => [u.couponId, Number(u.n)])),
  };
}

/**
 * RULE 9: records redemptions inside the order transaction. The conditional
 * increment is atomic, so two concurrent orders can never exceed usage_limit.
 */
export async function redeemCoupons(tx: Tx, applied: AppliedCoupon[], userId: string, orderId: string) {
  for (const c of applied) {
    const updated = await tx
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(and(eq(coupons.id, c.couponId), sql`(${coupons.usageLimit} is null or ${coupons.usedCount} < ${coupons.usageLimit})`))
      .returning({ id: coupons.id });
    if (updated.length === 0) {
      throw new DomainError("COUPON_USAGE_EXCEEDED", `Coupon ${c.code} has just reached its usage limit.`, 409);
    }
    await tx.insert(couponUsage).values({ couponId: c.couponId, userId, orderId, discountPaise: c.discountPaise });
  }
}

/** Returns redemptions to the pool when an order is cancelled or rejected. */
export async function releaseCoupons(tx: Tx, orderId: string) {
  const released = await tx.delete(couponUsage).where(eq(couponUsage.orderId, orderId)).returning({ couponId: couponUsage.couponId });
  for (const r of released) {
    await tx
      .update(coupons)
      .set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` })
      .where(eq(coupons.id, r.couponId));
  }
}
