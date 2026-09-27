import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import {
  adminCreateSchema,
  adminUpdateSchema,
  auditQuerySchema,
  listQuerySchema,
  recoveryUpdateSchema,
  rolePermissionsSchema,
  storeSettingsSchema,
  whatsappTemplateUpdateSchema,
} from "../../contracts/admin";
import type { AbandonedCheckoutDTO, AdminUserDTO, RoleDTO, WhatsAppConversationDTO, WhatsAppTemplateDTO } from "../../contracts/dto";
import type { AdminRole, CheckoutStatus, Permission } from "../../contracts/enums";
import { db } from "../../db/client";
import { ref } from "../../db/sql";
import {
  adminUsers,
  auditLogs,
  checkoutSessions,
  orders,
  permissions,
  rolePermissions,
  roles,
  users,
  whatsappConversations,
  whatsappMessages,
  whatsappTemplates,
} from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { recordAudit } from "../../lib/audit";
import { hashPassword } from "../../lib/crypto";
import { notFound, readJson, readQuery } from "../../lib/http";
import { adminOf, requirePermission } from "../auth/middleware";
import { revokeAllAdminSessions } from "../auth/sessions";
import { getStoreSettings, updateStoreSettings } from "../settings/service";
import { auditDTO } from "./orders";

/* ────────────────────────────── Audit logs ─────────────────────────────── */

export const adminAuditRoutes = new Hono<AppEnv>().get("/", requirePermission("audit.view"), async (c) => {
  const q = readQuery(c, auditQuerySchema);
  const conds: SQL[] = [];
  if (q.entityType) conds.push(eq(auditLogs.entityType, q.entityType));
  if (q.entityId) conds.push(eq(auditLogs.entityId, q.entityId));
  if (q.action) conds.push(sql`${auditLogs.action} like ${`${q.action.replace(/[\\%_]/g, "\\$&")}%`}`);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  return c.json({
    items: rows.map(auditDTO),
    page: q.page,
    pageSize: q.pageSize,
    total: Number(total),
    totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
  });
});

/* ───────────────────────────── Admin accounts ──────────────────────────── */

async function roleId(key: AdminRole) {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
  if (!role) throw notFound("Role");
  return role.id;
}

async function countActiveSuperAdmins() {
  const [row] = await db
    .select({ n: count() })
    .from(adminUsers)
    .innerJoin(roles, eq(roles.id, adminUsers.roleId))
    .where(and(eq(roles.key, "SUPER_ADMIN"), eq(adminUsers.isActive, true)));
  return Number(row?.n ?? 0);
}

export const adminUserRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("admins.manage"), async (c) => {
    const rows = await db
      .select({ a: adminUsers, role: roles.key })
      .from(adminUsers)
      .innerJoin(roles, eq(roles.id, adminUsers.roleId))
      .orderBy(asc(adminUsers.createdAt));
    const list: AdminUserDTO[] = rows.map(({ a, role }) => ({
      id: a.id,
      email: a.email,
      fullName: a.fullName,
      role: role as AdminRole,
      isActive: a.isActive,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      mfaEnrolled: a.totpSecret !== null,
      createdAt: a.createdAt.toISOString(),
    }));
    return c.json(list);
  })
  .post("/", requirePermission("admins.manage"), async (c) => {
    const input = await readJson(c, adminCreateSchema);
    try {
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(adminUsers)
          .values({
            email: input.email,
            fullName: input.fullName,
            passwordHash: await hashPassword(input.password),
            roleId: await roleId(input.role),
          })
          .returning();
        await recordAudit(tx, adminOf(c), {
          action: "admin.created",
          entityType: "admin_user",
          entityId: created!.id,
          after: { email: created!.email, role: input.role },
        });
      });
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "23505")
        throw new DomainError("EMAIL_IN_USE", "An admin with this email already exists.", 409);
      throw error;
    }
    return c.json({ ok: true }, 201);
  })
  .patch("/:id", requirePermission("admins.manage"), async (c) => {
    const input = await readJson(c, adminUpdateSchema);
    const actor = adminOf(c);
    const id = c.req.param("id");
    const [before] = await db
      .select({ a: adminUsers, role: roles.key })
      .from(adminUsers)
      .innerJoin(roles, eq(roles.id, adminUsers.roleId))
      .where(eq(adminUsers.id, id));
    if (!before) throw notFound("Admin");
    const demotingSuper = before.role === "SUPER_ADMIN" && ((input.role && input.role !== "SUPER_ADMIN") || input.isActive === false);
    if (demotingSuper && (await countActiveSuperAdmins()) <= 1) {
      throw new DomainError("LAST_SUPER_ADMIN", "At least one active super admin is required.", 409);
    }
    await db.transaction(async (tx) => {
      const [after] = await tx
        .update(adminUsers)
        .set({
          ...(input.fullName ? { fullName: input.fullName } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.role ? { roleId: await roleId(input.role) } : {}),
        })
        .where(eq(adminUsers.id, id))
        .returning();
      await recordAudit(tx, actor, {
        action: input.role && input.role !== before.role ? "admin.permission_changed" : "admin.updated",
        entityType: "admin_user",
        entityId: id,
        before: { fullName: before.a.fullName, role: before.role, isActive: before.a.isActive },
        after: { fullName: after!.fullName, role: input.role ?? before.role, isActive: after!.isActive },
      });
    });
    if (input.isActive === false || (input.role && input.role !== before.role)) await revokeAllAdminSessions(id);
    return c.json({ ok: true });
  });

export const adminRoleRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("admins.manage", "settings.manage"), async (c) => {
    const [roleRows, links] = await Promise.all([
      db.select().from(roles).orderBy(asc(roles.createdAt)),
      db
        .select({ roleId: rolePermissions.roleId, key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)),
    ]);
    const list: RoleDTO[] = roleRows.map((r) => ({
      id: r.id,
      key: r.key as AdminRole,
      name: r.name,
      description: r.description,
      permissions: links.filter((l) => l.roleId === r.id).map((l) => l.key as Permission),
    }));
    return c.json(list);
  })
  .put("/:id/permissions", requirePermission("admins.manage"), async (c) => {
    const input = await readJson(c, rolePermissionsSchema);
    const id = c.req.param("id");
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw notFound("Role");
    if (role.key === "SUPER_ADMIN") throw new DomainError("ROLE_LOCKED", "Super admin always has every permission.", 409);
    await db.transaction(async (tx) => {
      const before = await tx
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, id));
      const perms = input.permissions.length ? await tx.select().from(permissions).where(inArray(permissions.key, input.permissions)) : [];
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (perms.length) await tx.insert(rolePermissions).values(perms.map((p) => ({ roleId: id, permissionId: p.id })));
      await recordAudit(tx, adminOf(c), {
        action: "admin.permission_changed",
        entityType: "role",
        entityId: id,
        before: { permissions: before.map((b) => b.key).sort() },
        after: { permissions: [...input.permissions].sort() },
      });
    });
    return c.json({ ok: true });
  });

/* ──────────────────────────────── Settings ─────────────────────────────── */

export const adminSettingsRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("settings.manage", "dashboard.view"), async (c) => c.json(await getStoreSettings()))
  .put("/", requirePermission("settings.manage"), async (c) => {
    const input = await readJson(c, storeSettingsSchema);
    return c.json(
      await updateStoreSettings(adminOf(c), {
        freeShippingThresholdPaise: input.freeShippingThreshold,
        flatShippingPaise: input.flatShippingFee,
        codEnabled: input.codEnabled,
        codFeePaise: input.codFee,
        codMaxOrderPaise: input.codMaxOrderValue,
        lowStockThreshold: input.lowStockThreshold,
      }),
    );
  });

/* ─────────────────────────── Abandoned checkouts ───────────────────────── */

export const adminCheckoutRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("orders.view", "customers.view"), async (c) => {
    const q = readQuery(c, listQuerySchema);
    const status = (c.req.query("status") ?? "ABANDONED") as CheckoutStatus;
    const where = eq(checkoutSessions.status, status);
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({ s: checkoutSessions, name: users.fullName, phone: users.phone, orderNumber: orders.orderNumber })
        .from(checkoutSessions)
        .innerJoin(users, eq(users.id, checkoutSessions.userId))
        .leftJoin(orders, eq(orders.id, checkoutSessions.convertedOrderId))
        .where(where)
        .orderBy(desc(checkoutSessions.lastActivityAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: count() }).from(checkoutSessions).where(where),
    ]);
    const items: AbandonedCheckoutDTO[] = rows.map(({ s, name, phone, orderNumber }) => ({
      id: s.id,
      customerId: s.userId,
      customerName: name,
      customerPhone: phone,
      status: s.status,
      recoveryStatus: s.recoveryStatus,
      totalPaise: s.totalPaise,
      items: s.cartSnapshot.map((l) => ({ name: l.name, size: l.size, quantity: l.quantity, unitPricePaise: l.unitPricePaise })),
      step: s.step,
      lastActivityAt: s.lastActivityAt.toISOString(),
      abandonedAt: s.abandonedAt?.toISOString() ?? null,
      convertedOrderNumber: orderNumber,
    }));
    return c.json({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    });
  })
  .patch("/:id", requirePermission("orders.manage", "customers.manage"), async (c) => {
    const { recoveryStatus } = await readJson(c, recoveryUpdateSchema);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, c.req.param("id")));
      if (!before) throw notFound("Checkout");
      await tx.update(checkoutSessions).set({ recoveryStatus }).where(eq(checkoutSessions.id, before.id));
      await recordAudit(tx, adminOf(c), {
        action: "checkout.recovery_updated",
        entityType: "checkout",
        entityId: before.id,
        before: { recoveryStatus: before.recoveryStatus },
        after: { recoveryStatus },
      });
    });
    return c.json({ ok: true });
  });

/* ──────────────────────────────── WhatsApp ─────────────────────────────── */

export const adminWhatsAppRoutes = new Hono<AppEnv>()
  .get("/conversations", requirePermission("whatsapp.view"), async (c) => {
    const rows = await db
      .select({
        c: whatsappConversations,
        name: users.fullName,
        messageCount: sql<number>`(select count(*) from ${whatsappMessages} m where m.conversation_id = ${ref(whatsappConversations.id)})::int`,
      })
      .from(whatsappConversations)
      .leftJoin(users, eq(users.id, whatsappConversations.userId))
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(100);
    const list: WhatsAppConversationDTO[] = rows.map(({ c: conv, name, messageCount }) => ({
      id: conv.id,
      phone: conv.phone,
      customerName: name,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      messageCount: Number(messageCount),
    }));
    return c.json(list);
  })
  .get("/conversations/:id/messages", requirePermission("whatsapp.view"), async (c) => {
    const rows = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, c.req.param("id")))
      .orderBy(asc(whatsappMessages.createdAt))
      .limit(500);
    return c.json(
      rows.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        templateTopic: m.templateTopic,
        error: m.error,
        createdAt: m.createdAt.toISOString(),
      })),
    );
  })
  .get("/templates", requirePermission("whatsapp.view"), async (c) => {
    const rows = await db.select().from(whatsappTemplates).orderBy(asc(whatsappTemplates.topic));
    const list: WhatsAppTemplateDTO[] = rows.map((t) => ({
      id: t.id,
      topic: t.topic,
      providerTemplateName: t.providerTemplateName,
      language: t.language,
      variables: t.variables,
      previewBody: t.previewBody,
      isApproved: t.isApproved,
      isActive: t.isActive,
    }));
    return c.json(list);
  })
  .put("/templates/:id", requirePermission("settings.manage"), async (c) => {
    const input = await readJson(c, whatsappTemplateUpdateSchema);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(whatsappTemplates)
        .where(eq(whatsappTemplates.id, c.req.param("id")));
      if (!before) throw notFound("Template");
      const [after] = await tx.update(whatsappTemplates).set(input).where(eq(whatsappTemplates.id, before.id)).returning();
      await recordAudit(tx, adminOf(c), {
        action: "whatsapp.template_updated",
        entityType: "whatsapp_template",
        entityId: before.id,
        before,
        after,
      });
    });
    return c.json({ ok: true });
  });
