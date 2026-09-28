import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { env } from "../../config/env";
import { clientIp } from "../../lib/rate-limit";
import { requireAdmin, requirePermission } from "../auth/middleware";
import { adminAnalyticsRoutes, adminDashboardRoutes } from "./analytics";
import { adminCatalogRoutes } from "./catalog";
import { adminCouponRoutes } from "./coupons";
import { adminCustomerRoutes } from "./customers";
import {
  adminAuditRoutes,
  adminCheckoutRoutes,
  adminRoleRoutes,
  adminSettingsRoutes,
  adminUserRoutes,
  adminWhatsAppRoutes,
} from "./governance";
import { adminInventoryRoutes } from "./inventory";
import { adminOrderRoutes, adminRefundRoutes } from "./orders";
import { adminReturnRoutes } from "./returns";

/** Every admin route requires an authenticated admin session; each handler then checks its permission. */
export const adminRoutes = new Hono<AppEnv>()
  .use(requireAdmin)
  .route("/dashboard", adminDashboardRoutes)
  .route("/analytics", adminAnalyticsRoutes)
  .route("/orders", adminOrderRoutes)
  .route("/refunds", adminRefundRoutes)
  .route("/catalog", adminCatalogRoutes)
  .route("/inventory", adminInventoryRoutes)
  .route("/customers", adminCustomerRoutes)
  .route("/coupons", adminCouponRoutes)
  .route("/returns", adminReturnRoutes)
  .route("/checkouts", adminCheckoutRoutes)
  .route("/audit-logs", adminAuditRoutes)
  .route("/admins", adminUserRoutes)
  .route("/roles", adminRoleRoutes)
  .route("/settings", adminSettingsRoutes)
  .route("/whatsapp", adminWhatsAppRoutes)
  /**
   * Deployment check: shows which client address rate limits will use and the
   * forwarding headers that reached the API, to set CLIENT_IP_HEADER /
   * TRUSTED_PROXY_HOPS correctly (docs/deployment.md).
   */
  .get("/diagnostics/request", requirePermission("settings.manage"), (c) =>
    c.json({
      clientIp: clientIp(c),
      config: { clientIpHeader: env.CLIENT_IP_HEADER || null, trustedProxyHops: env.TRUSTED_PROXY_HOPS },
      headers: Object.fromEntries(
        ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for", "cf-connecting-ip", "true-client-ip"].map((h) => [
          h,
          c.req.header(h) ?? null,
        ]),
      ),
    }),
  );
