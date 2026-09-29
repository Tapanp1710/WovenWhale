import { eq, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../../app-env";
import { env } from "../../config/env";
import type { AdminRole, Permission } from "../../contracts/enums";
import { db } from "../../db/client";
import { adminUsers, permissions, rolePermissions, roles, sessions, users } from "../../db/schema";
import { COOKIE, readCookie } from "../../lib/cookies";
import { HttpError } from "../../lib/http";
import { liveSession, touchSession } from "./sessions";

/** Resolves the customer session (if any) for every request. Never throws. */
export const loadCustomer: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("customer", null);
  const token = readCookie(c, COOKIE.customerSession);
  if (token) {
    const [row] = await db
      .select({
        id: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        userId: users.id,
        phone: users.phone,
        isBlocked: users.isBlocked,
        deletedAt: users.deletedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(liveSession(token, "CUSTOMER"));
    if (row) {
      await touchSession(row);
      if (!row.isBlocked && !row.deletedAt) c.set("customer", { id: row.userId, phone: row.phone, sessionId: row.id });
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

/**
 * Session, admin, role and permissions in ONE query: the API can sit a long
 * way from the database, so every extra round trip is felt on every page.
 */
async function resolveAdminSession(c: Context<AppEnv>) {
  const token = readCookie(c, COOKIE.adminSession);
  const [row] = token
    ? await db
        .select({
          sessionId: sessions.id,
          lastSeenAt: sessions.lastSeenAt,
          mfaVerified: sessions.mfaVerified,
          id: adminUsers.id,
          email: adminUsers.email,
          fullName: adminUsers.fullName,
          isActive: adminUsers.isActive,
          roleKey: roles.key,
          totpEnabledAt: adminUsers.totpEnabledAt,
          permissions: sql<Permission[]>`(select coalesce(json_agg(${permissions.key}), '[]'::json) from ${rolePermissions}
            inner join ${permissions} on ${permissions.id} = ${rolePermissions.permissionId}
            where ${rolePermissions.roleId} = ${adminUsers.roleId})`,
        })
        .from(sessions)
        .innerJoin(adminUsers, eq(adminUsers.id, sessions.adminUserId))
        .innerJoin(roles, eq(roles.id, adminUsers.roleId))
        .where(liveSession(token, "ADMIN"))
    : [];
  if (!row) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");
  await touchSession({ id: row.sessionId, lastSeenAt: row.lastSeenAt });
  const session = { id: row.sessionId, mfaVerified: row.mfaVerified };
  const admin = row;
  if (!admin.isActive) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");
  c.set("adminSession", {
    id: admin.id,
    email: admin.email,
    sessionId: session.id,
    mfaVerified: session.mfaVerified,
    mfaEnabled: admin.totpEnabledAt !== null,
  });
  return { session, admin };
}

/**
 * Accepts a password-verified admin session that may still be waiting for 2FA.
 * Only the sign-in, 2FA verification and enrolment endpoints use this.
 */
export const requireAdminSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  await resolveAdminSession(c);
  await next();
};

/**
 * Authenticates a fully signed-in admin (password and, where applicable, 2FA)
 * and loads role permissions fresh on every request, so permission changes and
 * account deactivation take effect immediately.
 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { session, admin } = await resolveAdminSession(c);
  if (!session.mfaVerified) throw new HttpError(401, "MFA_REQUIRED", "Two-factor verification required.");
  if (env.ADMIN_MFA_REQUIRED && !admin.totpEnabledAt) {
    throw new HttpError(401, "MFA_ENROLLMENT_REQUIRED", "Set up two-factor authentication to continue.");
  }

  c.set("admin", {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.roleKey as AdminRole,
    permissions: new Set(admin.permissions),
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

export function adminSessionOf(c: Context<AppEnv>) {
  const session = c.get("adminSession");
  if (!session) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");
  return session;
}

export function adminOf(c: Context<AppEnv>) {
  const admin = c.get("admin");
  if (!admin) throw new HttpError(401, "ADMIN_AUTH_REQUIRED", "Please sign in to the admin.");
  return admin;
}
