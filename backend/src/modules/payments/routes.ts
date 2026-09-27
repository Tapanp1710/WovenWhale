import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { paymentCallbackSchema } from "../../contracts/storefront";
import { db } from "../../db/client";
import { orders } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { readJson } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import { customerOf, requireCustomer } from "../auth/middleware";
import { initiatePayment, verifyClientCallback } from "./service";

export const paymentRoutes = new Hono<AppEnv>()
  .use(requireCustomer)
  /** Storefront posts the gateway's signed callback; success is only trusted after server verification. */
  .post("/verify", rateLimit("payment-verify", 30, 10 * 60 * 1000), async (c) => {
    const { orderNumber, payload } = await readJson(c, paymentCallbackSchema);
    return c.json(await verifyClientCallback(customerOf(c).id, orderNumber, payload));
  })
  /** Retry payment for an unpaid prepaid order (e.g. after a failed attempt). */
  .post("/:orderNumber/retry", rateLimit("payment-retry", 10, 10 * 60 * 1000), async (c) => {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.orderNumber, c.req.param("orderNumber")), eq(orders.userId, customerOf(c).id)));
    if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
    return c.json(await initiatePayment(order.id));
  });
