import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { AdminContext, AppEnv } from "../../app-env";
import {
  adminCancelSchema,
  adminOrderQuerySchema,
  codDecisionSchema,
  codRejectSchema,
  orderNoteSchema,
  orderStatusUpdateSchema,
  refundProcessSchema,
  shipmentCreateSchema,
} from "../../contracts/admin";
import type { AdminOrderDetailDTO, AdminOrderRowDTO, AuditLogDTO } from "../../contracts/dto";
import { ORDER_STATUSES, type OrderStatus } from "../../contracts/enums";
import { db } from "../../db/client";
import { adminUsers, auditLogs, orderItems, orderNotes, orders, payments, refunds, users } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { evaluateOrderTransition, type Actor } from "../../domain/order-state-machine";
import { recordAudit } from "../../lib/audit";
import { notFound, readJson, readQuery } from "../../lib/http";
import { adminOf, requirePermission } from "../auth/middleware";
import { kickNotificationDispatch } from "../notifications/service";
import { transitionOrder, type OrderRow } from "../orders/lifecycle";
import { buildOrderDetail } from "../orders/queries";
import { kickRefundProcessor, markRefund } from "../payments/service";
import { createShipment } from "../shipping/service";

const adminActor = (a: AdminContext): Actor => ({ type: "ADMIN", id: a.id, permissions: a.permissions });

export async function adminOrderRows(where: SQL | undefined, order: SQL[], limit: number, offset: number): Promise<AdminOrderRowDTO[]> {
  const rows = await db
    .select({ o: orders, customerName: users.fullName, customerPhone: users.phone })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  const ids = rows.map((r) => r.o.id);
  const items = ids.length
    ? await db
        .select({ orderId: orderItems.orderId, productName: orderItems.productName, size: orderItems.size, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
    : [];
  return rows.map(({ o, customerName, customerPhone }) => {
    const mine = items.filter((i) => i.orderId === o.id);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: customerName ?? o.shippingAddress.fullName,
      customerPhone,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalPaise: o.totalPaise,
      itemCount: mine.reduce((s, i) => s + i.quantity, 0),
      placedAt: o.placedAt.toISOString(),
      city: o.shippingAddress.city,
      pincode: o.shippingAddress.pincode,
      riskFlags: o.riskFlags,
      items: mine.map(({ productName, size, quantity }) => ({ productName, size, quantity })),
      shippingAddress: o.shippingAddress as AdminOrderRowDTO["shippingAddress"],
    };
  });
}

export const auditDTO = (a: typeof auditLogs.$inferSelect): AuditLogDTO => ({
  id: a.id,
  actorEmail: a.actorEmail,
  action: a.action,
  entityType: a.entityType,
  entityId: a.entityId,
  before: a.before,
  after: a.after,
  createdAt: a.createdAt.toISOString(),
});

async function loadOrder(id: string): Promise<OrderRow> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) throw notFound("Order");
  return order;
}

async function adminDetail(admin: AdminContext, order: OrderRow): Promise<AdminOrderDetailDTO> {
  const now = new Date();
  const [base, [customer], paymentRows, notes, audit, [{ n } = { n: 0 }]] = await Promise.all([
    buildOrderDetail(order, now),
    db.select().from(users).where(eq(users.id, order.userId)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.createdAt)),
    db
      .select({ id: orderNotes.id, body: orderNotes.body, author: adminUsers.fullName, createdAt: orderNotes.createdAt })
      .from(orderNotes)
      .innerJoin(adminUsers, eq(adminUsers.id, orderNotes.adminUserId))
      .where(eq(orderNotes.orderId, order.id))
      .orderBy(desc(orderNotes.createdAt)),
    db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "order"), eq(auditLogs.entityId, order.id)))
      .orderBy(desc(auditLogs.createdAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.userId, order.userId)),
  ]);
  const snapshot = {
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    cancelDeadlineAt: order.cancelDeadlineAt,
  };
  return {
    ...base,
    customer: { id: customer!.id, fullName: customer!.fullName, phone: customer!.phone, email: customer!.email, orderCount: Number(n) },
    riskFlags: order.riskFlags,
    payments: paymentRows.map((p) => ({
      id: p.id,
      provider: p.provider,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      amountPaise: p.amountPaise,
      status: p.status,
      isDuplicate: p.isDuplicate,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
    })),
    notes: notes.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() })),
    audit: audit.map(auditDTO),
    allowedTransitions: ORDER_STATUSES.filter((to) => evaluateOrderTransition(snapshot, to, adminActor(admin), now).ok),
  };
}

async function adminTransition(admin: AdminContext, orderId: string, to: OrderStatus, action: string, note?: string | null) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(orders).where(eq(orders.id, orderId));
    if (!before) throw notFound("Order");
    const after = await transitionOrder(tx, orderId, to, adminActor(admin), { note: note ?? null });
    await recordAudit(tx, admin, {
      action,
      entityType: "order",
      entityId: orderId,
      before: { status: before.status, paymentStatus: before.paymentStatus },
      after: { status: after.status, paymentStatus: after.paymentStatus, ...(note ? { note } : {}) },
    });
  });
  kickNotificationDispatch();
  kickRefundProcessor();
}

export const adminOrderRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("orders.view"), async (c) => {
    const q = readQuery(c, adminOrderQuerySchema);
    const conds: SQL[] = [];
    if (q.status) conds.push(eq(orders.status, q.status));
    if (q.paymentStatus) conds.push(eq(orders.paymentStatus, q.paymentStatus));
    if (q.paymentMethod) conds.push(eq(orders.paymentMethod, q.paymentMethod));
    if (q.from) conds.push(gte(orders.placedAt, q.from));
    if (q.to) conds.push(lte(orders.placedAt, q.to));
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      conds.push(
        or(ilike(orders.orderNumber, like), ilike(users.phone, like), ilike(users.fullName, like), ilike(orders.contactPhone, like))!,
      );
    }
    const where = conds.length ? and(...conds) : undefined;
    const sort = {
      newest: [desc(orders.placedAt)],
      oldest: [asc(orders.placedAt)],
      "total-high": [desc(orders.totalPaise)],
      "total-low": [asc(orders.totalPaise)],
    }[q.sort];
    const [items, [{ total } = { total: 0 }]] = await Promise.all([
      adminOrderRows(where, sort, q.pageSize, (q.page - 1) * q.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.userId))
        .where(where),
    ]);
    return c.json({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    });
  })
  .get("/cod-pending", requirePermission("orders.view"), async (c) =>
    c.json(await adminOrderRows(eq(orders.status, "PENDING_COD_APPROVAL"), [asc(orders.placedAt)], 100, 0)),
  )
  .get("/:id", requirePermission("orders.view"), async (c) => c.json(await adminDetail(adminOf(c), await loadOrder(c.req.param("id")))))
  .post("/:id/approve-cod", requirePermission("orders.approve_cod"), async (c) => {
    const { note } = await readJson(c, codDecisionSchema);
    const order = await loadOrder(c.req.param("id"));
    if (order.paymentMethod !== "COD") throw new DomainError("NOT_COD", "Only COD orders need approval.", 409);
    await adminTransition(adminOf(c), order.id, "CONFIRMED", "order.cod_approved", note ?? "COD approved");
    return c.json(await adminDetail(adminOf(c), await loadOrder(order.id)));
  })
  .post("/:id/reject-cod", requirePermission("orders.approve_cod"), async (c) => {
    const { reason } = await readJson(c, codRejectSchema);
    const order = await loadOrder(c.req.param("id"));
    if (order.paymentMethod !== "COD") throw new DomainError("NOT_COD", "Only COD orders need approval.", 409);
    await adminTransition(adminOf(c), order.id, "REJECTED", "order.cod_rejected", reason);
    return c.json(await adminDetail(adminOf(c), await loadOrder(order.id)));
  })
  .post("/:id/status", requirePermission("orders.manage"), async (c) => {
    const { to, note } = await readJson(c, orderStatusUpdateSchema);
    if (to === "SHIPPED") throw new DomainError("SHIPMENT_REQUIRED", "Use “Ship order” to add the courier and AWB.", 422);
    await adminTransition(adminOf(c), c.req.param("id"), to, `order.${to.toLowerCase()}`, note);
    return c.json(await adminDetail(adminOf(c), await loadOrder(c.req.param("id"))));
  })
  .post("/:id/cancel", requirePermission("orders.cancel_override"), async (c) => {
    const { reason } = await readJson(c, adminCancelSchema);
    await adminTransition(adminOf(c), c.req.param("id"), "CANCELLED", "order.cancelled_by_admin", reason);
    return c.json(await adminDetail(adminOf(c), await loadOrder(c.req.param("id"))));
  })
  .post("/:id/shipments", requirePermission("orders.manage"), async (c) => {
    const input = await readJson(c, shipmentCreateSchema);
    await createShipment(adminOf(c), c.req.param("id"), input);
    return c.json(await adminDetail(adminOf(c), await loadOrder(c.req.param("id"))));
  })
  .post("/:id/notes", requirePermission("orders.view"), async (c) => {
    const { body } = await readJson(c, orderNoteSchema);
    const order = await loadOrder(c.req.param("id"));
    await db.insert(orderNotes).values({ orderId: order.id, adminUserId: adminOf(c).id, body });
    return c.json(await adminDetail(adminOf(c), order), 201);
  });

export const adminRefundRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("returns.view", "refunds.approve"), async (c) => {
    const rows = await db
      .select({ f: refunds, orderNumber: orders.orderNumber, paymentMethod: orders.paymentMethod })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .orderBy(desc(refunds.createdAt))
      .limit(200);
    return c.json(
      rows.map(({ f, orderNumber, paymentMethod }) => ({
        id: f.id,
        orderId: f.orderId,
        orderNumber,
        paymentMethod,
        amountPaise: f.amountPaise,
        method: f.method,
        status: f.status,
        reason: f.reason,
        failureReason: f.failureReason,
        createdAt: f.createdAt.toISOString(),
        processedAt: f.processedAt?.toISOString() ?? null,
      })),
    );
  })
  /** Records a manual bank/UPI refund (COD orders) as paid out. */
  .post("/:id/mark-processed", requirePermission("refunds.approve"), async (c) => {
    const { reference } = await readJson(c, refundProcessSchema);
    const admin = adminOf(c);
    await db.transaction(async (tx) => {
      const [refund] = await tx
        .select()
        .from(refunds)
        .where(eq(refunds.id, c.req.param("id")))
        .for("update");
      if (!refund) throw notFound("Refund");
      if (refund.method === "ORIGINAL_PAYMENT")
        throw new DomainError("REFUND_AUTOMATIC", "Gateway refunds are settled automatically.", 409);
      if (refund.status === "PROCESSED") throw new DomainError("REFUND_ALREADY_PROCESSED", "This refund is already processed.", 409);
      await markRefund(tx, refund, true, null, reference);
      await recordAudit(tx, admin, {
        action: "refund.processed",
        entityType: "refund",
        entityId: refund.id,
        before: { status: refund.status },
        after: { status: "PROCESSED", reference },
      });
    });
    kickNotificationDispatch();
    return c.json({ ok: true });
  })
  .post("/:id/retry", requirePermission("refunds.approve"), async (c) => {
    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, c.req.param("id")));
    if (!refund || refund.status !== "FAILED") throw new DomainError("REFUND_NOT_RETRYABLE", "Only failed refunds can be retried.", 409);
    await db.update(refunds).set({ status: "PENDING", failureReason: null }).where(eq(refunds.id, refund.id));
    kickRefundProcessor();
    return c.json({ ok: true });
  });
