import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { env } from "../../config/env";
import { providers } from "../../integrations";
import { IgnoredWebhookEvent } from "../../integrations/payments/types";
import { safeEqual } from "../../lib/crypto";
import { HttpError } from "../../lib/http";
import { logger } from "../../lib/logger";
import { applyDeliveryReceipt, recordInboundMessage } from "../notifications/service";
import { handleVerifiedPaymentEvent } from "../payments/service";
import { applyTrackingEvents } from "../shipping/service";

/**
 * Inbound provider webhooks. Every handler verifies the provider signature on
 * the RAW body before parsing, and processing is idempotent so providers can
 * safely retry.
 */
export const webhookRoutes = new Hono<AppEnv>()
  .post("/payments/:provider", async (c) => {
    if (c.req.param("provider") !== providers.payments.name) throw new HttpError(404, "NOT_FOUND", "Unknown provider.");
    const raw = await c.req.text();
    let event;
    try {
      event = await providers.payments.parseWebhook(raw, c.req.raw.headers);
    } catch (error) {
      if (!(error instanceof IgnoredWebhookEvent)) throw error;
      return c.json({ received: true, ignored: error.event });
    }
    const { duplicate } = await handleVerifiedPaymentEvent(event);
    return c.json({ received: true, duplicate });
  })
  .post("/shipping/:provider", async (c) => {
    if (c.req.param("provider") !== providers.shipping.name) throw new HttpError(404, "NOT_FOUND", "Unknown provider.");
    const events = await providers.shipping.parseWebhook(await c.req.text(), c.req.raw.headers);
    await applyTrackingEvents(events);
    return c.json({ received: events.length });
  })
  // Meta subscription handshake.
  .get("/whatsapp", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    if (mode === "subscribe" && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token && safeEqual(token, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
      return c.text(c.req.query("hub.challenge") ?? "");
    }
    throw new HttpError(403, "FORBIDDEN", "Verification failed.");
  })
  .post("/whatsapp", async (c) => {
    const raw = await c.req.text();
    if (!providers.whatsapp.verifyWebhookSignature(raw, c.req.raw.headers)) {
      throw new HttpError(401, "INVALID_SIGNATURE", "Invalid signature.");
    }
    const events = providers.whatsapp.parseWebhook(JSON.parse(raw));
    for (const e of events) {
      if (e.kind === "status") await applyDeliveryReceipt(e.providerMessageId, e.status, e.timestamp, e.error);
      else await recordInboundMessage(e.from, e.body, e.providerMessageId, e.timestamp);
    }
    logger.info("whatsapp_webhook", { events: events.length });
    return c.json({ received: events.length });
  });
