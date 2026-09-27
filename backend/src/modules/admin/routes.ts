import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { requireAdmin } from "../auth/middleware";
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
  .route("/whatsapp", adminWhatsAppRoutes);
