import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { returnReplySchema } from "../../contracts/storefront";
import { readJson } from "../../lib/http";
import { customerOf, requireCustomer } from "../auth/middleware";
import { returnSummaries } from "../orders/queries";
import { replyToInfoRequest, withdrawReturn } from "./service";

export const returnRoutes = new Hono<AppEnv>()
  .use(requireCustomer)
  .get("/", async (c) => c.json(await returnSummaries({ userId: customerOf(c).id })))
  .post("/:returnNumber/reply", async (c) => {
    const { message } = await readJson(c, returnReplySchema);
    await replyToInfoRequest(customerOf(c).id, c.req.param("returnNumber"), message);
    return c.json({ ok: true });
  })
  .post("/:returnNumber/cancel", async (c) => {
    await withdrawReturn(customerOf(c).id, c.req.param("returnNumber"));
    return c.json({ ok: true });
  });
