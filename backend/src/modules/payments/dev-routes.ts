import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app-env";
import { providers } from "../../integrations";
import { MOCK_SIGNATURE_HEADER, MockPaymentProvider } from "../../integrations/payments/mock";
import { randomToken } from "../../lib/crypto";
import { HttpError, readJson } from "../../lib/http";
import { logger } from "../../lib/logger";
import { handleVerifiedPaymentEvent } from "./service";

/**
 * DEVELOPMENT ONLY (not mounted in production): simulates the payment gateway.
 * It signs a client callback and delivers a signed webhook through the real
 * verification path, so the storefront's payment UX can be exercised locally.
 */
export const devRoutes = new Hono<AppEnv>().post("/mock-gateway/pay", async (c) => {
  const gateway = providers.payments;
  if (!(gateway instanceof MockPaymentProvider)) throw new HttpError(404, "NOT_FOUND", "Mock gateway disabled.");
  const { providerOrderId, outcome, amountPaise } = await readJson(
    c,
    z.object({ providerOrderId: z.string().min(1), outcome: z.enum(["success", "failure"]), amountPaise: z.number().int().positive() }),
  );

  const providerPaymentId = `mock_pay_${randomToken(10)}`;
  const body = JSON.stringify({
    id: `evt_${randomToken(10)}`,
    event: outcome === "success" ? "payment.captured" : "payment.failed",
    providerOrderId,
    providerPaymentId,
    amountPaise,
    failureReason: outcome === "success" ? null : "Card declined by issuing bank (simulated)",
  });

  // Webhook arrives asynchronously, like a real gateway (and possibly after the callback).
  setTimeout(() => {
    const headers = new Headers({ [MOCK_SIGNATURE_HEADER]: gateway.signWebhook(body) });
    gateway
      .parseWebhook(body, headers)
      .then(handleVerifiedPaymentEvent)
      .catch((error) => logger.error("mock_webhook_failed", { error: String(error) }));
  }, 800);

  return c.json(
    outcome === "success"
      ? { outcome, callback: { providerOrderId, providerPaymentId, signature: gateway.signCallback(providerOrderId, providerPaymentId) } }
      : { outcome, error: "Card declined by issuing bank (simulated)" },
  );
});
