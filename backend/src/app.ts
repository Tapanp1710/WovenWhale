import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { mkdirSync } from "node:fs";
import { relative } from "node:path";
import type { AppEnv } from "./app-env";
import type { ApiErrorBody } from "./contracts/dto";
import { sqlClient } from "./db/client";
import { DomainError } from "./domain/errors";
import { InvalidSignatureError } from "./integrations/payments/types";
import { LOCAL_UPLOAD_DIR } from "./integrations/storage";
import { HttpError } from "./lib/http";
import { captureException } from "./lib/monitoring";
import { originGuard, visitorId } from "./lib/security";
import { addressRoutes } from "./modules/account/addresses";
import { wishlistRoutes } from "./modules/account/wishlist";
import { adminRoutes } from "./modules/admin/routes";
import { adminAuthRoutes, customerAuthRoutes } from "./modules/auth/routes";
import { loadCustomer } from "./modules/auth/middleware";
import { cartRoutes } from "./modules/cart/routes";
import { catalogRoutes } from "./modules/catalog/routes";
import { checkoutRoutes } from "./modules/checkout/routes";
import { engagementRoutes } from "./modules/events/routes";
import { orderRoutes, trackRoutes } from "./modules/orders/routes";
import { devRoutes } from "./modules/payments/dev-routes";
import { paymentRoutes } from "./modules/payments/routes";
import { returnRoutes } from "./modules/returns/routes";
import { webhookRoutes } from "./modules/webhooks/routes";
import { env, isProduction } from "./config/env";

export function createApp() {
  const app = new Hono<AppEnv>();
  mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });

  app.use(requestId());
  app.use(
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      crossOriginResourcePolicy: "same-site",
    }),
  );
  const tooLarge = bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json(errorBody("PAYLOAD_TOO_LARGE", "Request too large."), 413) });
  const uploadLimit = bodyLimit({
    maxSize: 9 * 1024 * 1024,
    onError: (c) => c.json(errorBody("PAYLOAD_TOO_LARGE", "Images must be 8 MB or smaller."), 413),
  });
  app.use("/api/*", (c, next) => (c.req.method === "POST" && c.req.path.endsWith("/images") ? uploadLimit : tooLarge)(c, next));
  app.use("/api/*", originGuard, visitorId, loadCustomer);
  app.use("/api/*", async (c, next) => {
    await next();
    // Personalised responses must never be cached by shared caches.
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "private, no-store");
  });

  app.get("/api/health", async (c) => {
    await sqlClient`select 1`;
    return c.json({ status: "ok" });
  });

  app.route("/api/catalog", catalogRoutes);
  app.route("/api/auth", customerAuthRoutes);
  app.route("/api/account/addresses", addressRoutes);
  app.route("/api/wishlist", wishlistRoutes);
  app.route("/api/cart", cartRoutes);
  app.route("/api/checkout", checkoutRoutes);
  app.route("/api/payments", paymentRoutes);
  app.route("/api/orders", orderRoutes);
  app.route("/api/track", trackRoutes);
  app.route("/api/returns", returnRoutes);
  app.route("/api", engagementRoutes);
  app.route("/api/webhooks", webhookRoutes);
  app.route("/api/admin/auth", adminAuthRoutes);
  app.route("/api/admin", adminRoutes);
  // The simulated gateway: development, or a labelled demo using the mock payment provider.
  if (!isProduction || (env.DEMO_MODE && env.PAYMENT_PROVIDER === "mock")) app.route("/api/dev", devRoutes);

  app.use(
    "/api/uploads/*",
    serveStatic({
      root: relative(process.cwd(), LOCAL_UPLOAD_DIR),
      rewriteRequestPath: (p) => p.replace(/^\/api\/uploads/, ""),
      onFound: (_path, c) => {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "Endpoint not found."), 404));

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(errorBody(error.code, error.message, error.fields), error.status);
    }
    if (error instanceof DomainError) {
      return c.json(errorBody(error.code, error.message, undefined, error.details), error.status);
    }
    // Malformed identifiers (e.g. a non-UUID in the path) are "not found", not server errors.
    const pgCode = (error as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "22P02") return c.json(errorBody("NOT_FOUND", "Not found."), 404);
    if (error instanceof InvalidSignatureError) {
      return c.json(errorBody("INVALID_SIGNATURE", "Invalid signature."), 401);
    }
    captureException(error, { requestId: c.get("requestId"), path: c.req.path, method: c.req.method });
    return c.json(errorBody("INTERNAL_ERROR", "Something went wrong on our side. Please try again."), 500);
  });

  return app;
}

function errorBody(code: string, message: string, fields?: Record<string, string>, details?: Record<string, unknown>): ApiErrorBody {
  return { error: { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}) } };
}

export type App = ReturnType<typeof createApp>;
