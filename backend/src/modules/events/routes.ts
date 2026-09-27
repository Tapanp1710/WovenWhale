import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { newsletterSchema, supportRequestSchema, trackEventSchema } from "../../contracts/storefront";
import { db } from "../../db/client";
import { newsletterSubscribers, supportRequests } from "../../db/schema";
import { readJson } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import { recordEvent } from "./service";

/** Storefront engagement endpoints: behavioural events, newsletter and support requests. */
export const engagementRoutes = new Hono<AppEnv>()
  .post("/events", rateLimit("events", 240, 60 * 1000), async (c) => {
    const input = await readJson(c, trackEventSchema);
    await recordEvent({
      type: input.type,
      visitorId: c.get("visitorId"),
      userId: c.get("customer")?.id ?? null,
      productId: input.productId ?? null,
      path: input.path ?? null,
      metadata: input.query ? { query: input.query.toLowerCase() } : undefined,
    });
    return c.body(null, 204);
  })
  .post("/newsletter", rateLimit("newsletter", 5, 60 * 60 * 1000), async (c) => {
    const { email, source } = await readJson(c, newsletterSchema);
    await db
      .insert(newsletterSubscribers)
      .values({ email, source })
      .onConflictDoUpdate({ target: newsletterSubscribers.email, set: { unsubscribedAt: null } });
    // Same response whether or not the address already existed (no enumeration).
    return c.json({ ok: true });
  })
  .post("/support", rateLimit("support", 5, 60 * 60 * 1000), async (c) => {
    const input = await readJson(c, supportRequestSchema);
    await db.insert(supportRequests).values({ ...input, userId: c.get("customer")?.id ?? null });
    return c.json({ ok: true }, 201);
  });
