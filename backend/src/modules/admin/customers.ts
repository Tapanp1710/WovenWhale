import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { customerUpdateSchema, listQuerySchema } from "../../contracts/admin";
import type { AdminCustomerDetailDTO, AdminCustomerRowDTO } from "../../contracts/dto";
import { db } from "../../db/client";
import {
  addresses,
  cartItems,
  carts,
  checkoutSessions,
  customerEvents,
  customerProfiles,
  orders,
  productVariants,
  products,
  users,
  whatsappConversations,
  whatsappMessages,
  wishlistItems,
  wishlists,
} from "../../db/schema";
import { recordAudit } from "../../lib/audit";
import { notFound, readJson, readQuery } from "../../lib/http";
import { toAddressDTO } from "../account/addresses";
import { adminOf, requirePermission } from "../auth/middleware";
import { orderRefunds, orderSummaries, returnSummaries } from "../orders/queries";

/** Revenue-bearing orders: excludes cancelled, rejected and never-paid orders. */
const countedOrder = sql`${orders.status} not in ('CANCELLED','REJECTED','PENDING_PAYMENT')`;

const stats = {
  orderCount: sql<number>`count(${orders.id}) filter (where ${countedOrder})::int`,
  totalSpentPaise: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${countedOrder}), 0)::int`,
  lastOrderAt: sql<Date | null>`max(${orders.placedAt})`,
};

export const adminCustomerRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("customers.view"), async (c) => {
    const q = readQuery(c, listQuerySchema);
    const conds: SQL[] = [isNull(users.deletedAt)];
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      conds.push(or(ilike(users.fullName, like), ilike(users.phone, like), ilike(users.email, like))!);
    }
    const where = and(...conds);
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({ u: users, ...stats })
        .from(users)
        .leftJoin(orders, eq(orders.userId, users.id))
        .where(where)
        .groupBy(users.id)
        .orderBy(desc(sql`max(${orders.placedAt})`), desc(users.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .where(where),
    ]);
    const items: AdminCustomerRowDTO[] = rows.map(({ u, orderCount, totalSpentPaise, lastOrderAt }) => ({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      email: u.email,
      orderCount: Number(orderCount),
      totalSpentPaise: Number(totalSpentPaise),
      lastOrderAt: lastOrderAt ? new Date(lastOrderAt).toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      isBlocked: u.isBlocked,
    }));
    return c.json({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    });
  })
  .get("/:id", requirePermission("customers.view"), async (c) => {
    const id = c.req.param("id");
    const [row] = await db
      .select({ u: users, profile: customerProfiles, ...stats })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .leftJoin(orders, eq(orders.userId, users.id))
      .where(eq(users.id, id))
      .groupBy(users.id, customerProfiles.userId);
    if (!row) throw notFound("Customer");

    const [addressRows, orderRows, wish, cart, checkouts, events, messages] = await Promise.all([
      db
        .select()
        .from(addresses)
        .where(and(eq(addresses.userId, id), isNull(addresses.deletedAt))),
      db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.placedAt)).limit(50),
      db
        .select({ productId: products.id, name: products.name, slug: products.slug })
        .from(wishlistItems)
        .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
        .innerJoin(products, eq(products.id, wishlistItems.productId))
        .where(eq(wishlists.userId, id)),
      db
        .select({ name: products.name, size: productVariants.size, quantity: cartItems.quantity })
        .from(cartItems)
        .innerJoin(carts, eq(carts.id, cartItems.cartId))
        .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(carts.userId, id)),
      db.select().from(checkoutSessions).where(eq(checkoutSessions.userId, id)).orderBy(desc(checkoutSessions.createdAt)).limit(20),
      db.select().from(customerEvents).where(eq(customerEvents.userId, id)).orderBy(desc(customerEvents.createdAt)).limit(100),
      db
        .select({ m: whatsappMessages })
        .from(whatsappMessages)
        .innerJoin(whatsappConversations, eq(whatsappConversations.id, whatsappMessages.conversationId))
        .where(eq(whatsappConversations.phone, row.u.phone))
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(50),
    ]);
    const refundLists = await Promise.all(orderRows.map((o) => orderRefunds(o.id)));
    const orderCount = Number(row.orderCount);
    const totalSpent = Number(row.totalSpentPaise);

    const detail: AdminCustomerDetailDTO = {
      id: row.u.id,
      fullName: row.u.fullName,
      phone: row.u.phone,
      email: row.u.email,
      orderCount,
      totalSpentPaise: totalSpent,
      lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt).toISOString() : null,
      createdAt: row.u.createdAt.toISOString(),
      isBlocked: row.u.isBlocked,
      averageOrderValuePaise: orderCount ? Math.round(totalSpent / orderCount) : 0,
      whatsappOptIn: row.profile?.whatsappOptIn ?? false,
      marketingOptIn: row.profile?.marketingOptIn ?? false,
      acquisitionSource: row.profile?.acquisitionSource ?? null,
      addresses: addressRows.map(toAddressDTO),
      orders: await orderSummaries(orderRows),
      wishlist: wish,
      cart,
      checkouts: checkouts.map((s) => ({
        id: s.id,
        status: s.status,
        totalPaise: s.totalPaise,
        lastActivityAt: s.lastActivityAt.toISOString(),
        recoveryStatus: s.recoveryStatus,
      })),
      returns: await returnSummaries({ userId: id }),
      refunds: refundLists.flat(),
      events: events.map((e) => ({ type: e.type, path: e.path, createdAt: e.createdAt.toISOString(), metadata: e.metadata })),
      whatsappMessages: messages.map(({ m }) => ({
        direction: m.direction,
        body: m.body,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        templateTopic: m.templateTopic,
      })),
    };
    return c.json(detail);
  })
  .patch("/:id", requirePermission("customers.manage"), async (c) => {
    const input = await readJson(c, customerUpdateSchema);
    const admin = adminOf(c);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(users)
        .where(eq(users.id, c.req.param("id")));
      if (!before) throw notFound("Customer");
      const [after] = await tx.update(users).set(input).where(eq(users.id, before.id)).returning();
      await recordAudit(tx, admin, { action: "customer.updated", entityType: "customer", entityId: before.id, before, after });
    });
    return c.json({ ok: true });
  });
