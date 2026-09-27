import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { checkoutProgressSchema, placeOrderSchema, quoteQuerySchema } from "../../contracts/storefront";
import { readJson, readQuery } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import { customerOf, requireCustomer } from "../auth/middleware";
import { getQuote, placeOrder, startCheckout, touchCheckout } from "./service";

export const checkoutRoutes = new Hono<AppEnv>()
  .use(requireCustomer)
  .post("/start", async (c) => c.json(await startCheckout(customerOf(c).id, c.get("visitorId"))))
  .post("/progress", async (c) => {
    const { step } = await readJson(c, checkoutProgressSchema);
    await touchCheckout(customerOf(c).id, step);
    return c.body(null, 204);
  })
  .get("/quote", async (c) => {
    const { paymentMethod } = readQuery(c, quoteQuerySchema);
    return c.json(await getQuote(customerOf(c).id, paymentMethod ?? null));
  })
  .post(
    "/orders",
    rateLimit("place-order", 10, 10 * 60 * 1000, (c) => c.get("customer")?.id ?? "anon"),
    async (c) => {
      const input = await readJson(c, placeOrderSchema);
      const customer = customerOf(c);
      const result = await placeOrder(customer.id, input, { visitorId: c.get("visitorId"), accountPhone: customer.phone });
      return c.json(result, 201);
    },
  );
