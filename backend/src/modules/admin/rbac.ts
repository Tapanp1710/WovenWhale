import { eq, sql } from "drizzle-orm";
import { ADMIN_ROLES, NOTIFICATION_TOPICS, PERMISSIONS, type AdminRole, type Permission } from "../../contracts/enums";
import { db } from "../../db/client";
import { adminUsers, permissions, rolePermissions, roles, whatsappTemplates } from "../../db/schema";
import { hashPassword } from "../../lib/crypto";

/** Default role → permission matrix. Editable later from Admin → Settings → Roles. */
export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((p) => p !== "admins.manage"),
  ORDER_MANAGER: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "orders.approve_cod",
    "orders.cancel_override",
    "customers.view",
    "returns.view",
    "returns.manage",
    "products.view",
    "inventory.view",
    "coupons.view",
    "whatsapp.view",
    "whatsapp.reply",
  ],
  INVENTORY_MANAGER: ["dashboard.view", "products.view", "products.manage", "inventory.view", "inventory.manage", "orders.view"],
  SUPPORT: [
    "dashboard.view",
    "orders.view",
    "customers.view",
    "returns.view",
    "returns.manage",
    "products.view",
    "coupons.view",
    "whatsapp.view",
    "whatsapp.reply",
  ],
};

const ROLE_INFO: Record<AdminRole, { name: string; description: string }> = {
  SUPER_ADMIN: { name: "Super admin", description: "Full access including admin accounts and roles." },
  ADMIN: { name: "Admin", description: "Runs the store: catalog, orders, refunds, settings." },
  ORDER_MANAGER: { name: "Order manager", description: "Order processing, COD approvals, cancellations and returns." },
  INVENTORY_MANAGER: { name: "Inventory manager", description: "Catalog and stock management." },
  SUPPORT: { name: "Customer support", description: "Read access to orders and customers; handles returns." },
};

/** Suggested WhatsApp template bodies. Inactive until approved in WhatsApp Manager. */
const TEMPLATE_PREVIEWS: Partial<Record<(typeof NOTIFICATION_TOPICS)[number], { body: string; vars: string[] }>> = {
  OTP: { body: "{{1}} is your WovenWhale verification code. It expires in 10 minutes.", vars: ["code"] },
  ORDER_PLACED: { body: "Hi {{1}}, we've received your order {{2}} for {{3}}.", vars: ["name", "orderNumber", "total"] },
  ORDER_CONFIRMED: { body: "Hi {{1}}, your order {{2}} is confirmed and will be packed soon.", vars: ["name", "orderNumber"] },
  COD_APPROVED: { body: "Hi {{1}}, your cash-on-delivery order {{2}} is confirmed.", vars: ["name", "orderNumber"] },
  COD_REJECTED: { body: "Hi {{1}}, we couldn't accept COD for order {{2}}. Reason: {{3}}", vars: ["name", "orderNumber", "reason"] },
  ORDER_CANCELLED: { body: "Hi {{1}}, your order {{2}} has been cancelled.", vars: ["name", "orderNumber"] },
  SHIPPING_UPDATE: { body: "Your order {{1}} has shipped with {{2}}. AWB: {{3}}", vars: ["orderNumber", "courier", "awb"] },
  DELIVERY_UPDATE: { body: "Your order {{1}} is {{2}}.", vars: ["orderNumber", "status"] },
  RETURN_UPDATE: { body: "Update on your request {{1}}: {{2}}", vars: ["returnNumber", "status"] },
  REFUND_UPDATE: { body: "A refund of {{1}} for order {{2}} is {{3}}.", vars: ["amount", "orderNumber", "status"] },
  ABANDONED_CHECKOUT: { body: "Hi {{1}}, your WovenWhale bag is waiting. Complete your order: {{2}}", vars: ["name", "link"] },
  CUSTOMER_SUPPORT: { body: "Hi {{1}}, {{2}}", vars: ["name", "message"] },
};

/**
 * Idempotent bootstrap of reference data required in every environment:
 * permissions, roles, the role matrix (only for roles with no permissions yet,
 * so admin edits survive) and inactive WhatsApp template placeholders.
 */
export async function bootstrapReferenceData() {
  await db.transaction(async (tx) => {
    await tx
      .insert(permissions)
      .values(PERMISSIONS.map((key) => ({ key })))
      .onConflictDoNothing();
    const permRows = await tx.select().from(permissions);
    const permId = new Map(permRows.map((p) => [p.key, p.id]));

    for (const key of ADMIN_ROLES) {
      const [role] = await tx
        .insert(roles)
        .values({ key, ...ROLE_INFO[key] })
        .onConflictDoUpdate({ target: roles.key, set: { name: ROLE_INFO[key].name } })
        .returning({ id: roles.id });
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, role!.id));
      if (Number(n) === 0 || key === "SUPER_ADMIN") {
        await tx
          .insert(rolePermissions)
          .values(DEFAULT_ROLE_PERMISSIONS[key].map((p) => ({ roleId: role!.id, permissionId: permId.get(p)! })))
          .onConflictDoNothing();
      }
    }

    for (const topic of NOTIFICATION_TOPICS) {
      const preview = TEMPLATE_PREVIEWS[topic];
      if (!preview) continue;
      await tx
        .insert(whatsappTemplates)
        .values({
          topic,
          providerTemplateName: `ww_${topic.toLowerCase()}`,
          variables: preview.vars,
          previewBody: preview.body,
        })
        .onConflictDoNothing();
    }
  });
}

/** Creates the first super-admin if none exists. Password must be changed after first login. */
export async function ensureSuperAdmin(email: string, password: string, fullName = "Store Owner") {
  const [role] = await db.select().from(roles).where(eq(roles.key, "SUPER_ADMIN"));
  if (!role) throw new Error("Run bootstrapReferenceData first");
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.roleId, role.id)).limit(1);
  if (existing) return { created: false };
  await db.insert(adminUsers).values({ email: email.toLowerCase(), fullName, passwordHash: await hashPassword(password), roleId: role.id });
  return { created: true };
}
