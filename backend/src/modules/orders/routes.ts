import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { paginationSchema } from "../../contracts/validation";
import { cancelOrderSchema, createReturnSchema, trackOrderSchema } from "../../contracts/storefront";
import { db } from "../../db/client";
import { orders } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { readJson, readQuery } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import { customerOf, requireCustomer } from "../auth/middleware";
import { kickNotificationDispatch } from "../notifications/service";
import { kickRefundProcessor } from "../payments/service";
import { createReturn } from "../returns/service";
import { transitionOrder } from "./lifecycle";
import { buildOrderDetail, buildTrackView, orderSummaries } from "./queries";

async function ownedOrder(userId: string, orderNumber: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber.toUpperCase()), eq(orders.userId, userId)));
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
  return order;
}

export const orderRoutes = new Hono<AppEnv>()
  .use(requireCustomer)
  .get("/", async (c) => {
    const { page, pageSize } = readQuery(c, paginationSchema);
    const userId = customerOf(c).id;
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.placedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.userId, userId)),
    ]);
    return c.json({
      items: await orderSummaries(rows),
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / pageSize)),
    });
  })
  .get("/:orderNumber", async (c) => c.json(await buildOrderDetail(await ownedOrder(customerOf(c).id, c.req.param("orderNumber")))))
  .post("/:orderNumber/cancel", async (c) => {
    const { reason } = await readJson(c, cancelOrderSchema);
    const customer = customerOf(c);
    const order = await ownedOrder(customer.id, c.req.param("orderNumber"));
    // RULE 5 enforced inside the state machine against the stored cancel_deadline_at.
    await db.transaction((tx) => transitionOrder(tx, order.id, "CANCELLED", { type: "CUSTOMER", id: customer.id }, { note: reason }));
    kickNotificationDispatch();
    kickRefundProcessor();
    return c.json(await buildOrderDetail(await ownedOrder(customer.id, order.orderNumber)));
  })
  .post("/:orderNumber/returns", rateLimit("return-create", 10, 60 * 60 * 1000), async (c) => {
    const input = await readJson(c, createReturnSchema);
    const customer = customerOf(c);
    const created = await createReturn(customer.id, c.req.param("orderNumber").toUpperCase(), input);
    return c.json({ returnNumber: created.returnNumber }, 201);
  });

/** Public order tracking: order number + the phone used on the order. */
export const trackRoutes = new Hono<AppEnv>().post("/", rateLimit("track", 20, 10 * 60 * 1000), async (c) => {
  const { orderNumber, phone } = await readJson(c, trackOrderSchema);
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.contactPhone, phone)));
  // Same message for "no such order" and "wrong phone" — no enumeration.
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "We couldn't find an order with those details.", 404);
  return c.json(await buildTrackView(order));
});
