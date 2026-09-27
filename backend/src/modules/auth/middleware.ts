import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../../app-env";
import type { AdminRole, Permission } from "../../contracts/enums";
import { db } from "../../db/client";
import { adminUsers, permissions, rolePermissions, roles, users } from "../../db/schema";
import { COOKIE, readCookie } from "../../lib/cookies";
import { HttpError } from "../../lib/http";
import { findSession } from "./sessions";

/** Resolves the customer session (if any) for every request. Never throws. */
export const loadCustomer: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("customer", null);
  const token = readCookie(c, COOKIE.customerSession);
  if (token) {
    const session = await findSession(token, "CUSTOMER");
    if (session?.userId) {
      const [user] = await db
        .select({ id: users.id, phone: users.phone, isBlocked: users.isBlocked, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, session.userId));
      if (user && !user.isBlocked && !user.deletedAt) {
        c.set("customer", { id: user.id, phone: user.phone, sessionId: session.id });
      }
    }
  }
  await next();
};

export const requireCustomer: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("customer")) throw new HttpError(401, "AUTH_REQUIRED", "Please sign in to continue.");
  await next();
};

export function customerOf(c: Context<AppEnv>) {
  const customer = c.get("customer");
  if (!customer) throw new HttpError(401, "AUTH_REQUIRED", "Please sign in to continue.");
  return customer;
}

async function loadPermissions(roleId: string): Promise<Set<Permission>> {
  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  return new Set(rows.map((r) => r.key as Permission));
}

/**
 * Authenticates an admin from the admin session cookie and loads role
 * permissions fresh on every request, so permission changes and account
 * deactivation take effect immediately.
 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readCookie(c, COOKIE.adminSession);
  const session = token ? await findSession(token, "ADMIN") : null;
  if (!session?.adminUserId) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");
  if (!session.mfaVerified) throw new HttpError(401, "MFA_REQUIRED", "Two-factor verification required.");

  const [admin] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      isActive: adminUsers.isActive,
      roleId: adminUsers.roleId,
      roleKey: roles.key,
    })
    .from(adminUsers)
    .innerJoin(roles, eq(roles.id, adminUsers.roleId))
    .where(eq(adminUsers.id, session.adminUserId));
  if (!admin?.isActive) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");

  c.set("admin", {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.roleKey as AdminRole,
    permissions: await loadPermissions(admin.roleId),
    sessionId: session.id,
  });
  await next();
};

/** RBAC gate. Use after `requireAdmin`. Any one of the listed permissions suffices. */
export function requirePermission(...needed: Permission[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const admin = c.get("admin");
    if (!admin || !needed.some((p) => admin.permissions.has(p))) {
      throw new HttpError(403, "FORBIDDEN", "You don't have permission to do that.");
    }
    await next();
  };
}

export function adminOf(c: Context<AppEnv>) {
  const admin = c.get("admin");
  if (!admin) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");
  return admin;
}
