import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { env } from "../../config/env";
import type { NotificationTopic, OrderStatus, PaymentStatus, RefundStatus } from "../../contracts/enums";
import { formatINR } from "../../contracts/money";
import type { Tx } from "../../db/client";
import { orderItems, orderStatusHistory, orders, payments, refunds, shipments } from "../../db/schema";
import { computeReturnDeadline } from "../../domain/deadlines";
import { DomainError } from "../../domain/errors";
import { RESERVATION_STATUSES, evaluateOrderTransition, isPaymentTransitionAllowed, type Actor } from "../../domain/order-state-machine";
import { releaseCoupons } from "../coupons/service";
import { recordEvent } from "../events/service";
import { applyMovement, lockInventory } from "../inventory/service";
import { queueNotification } from "../notifications/service";

export type OrderRow = typeof orders.$inferSelect;

export async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
  return order;
}

const actorId = (actor: Actor) => (actor.type === "SYSTEM" ? null : actor.id);

/** RULE 4: payment status moves on its own guarded state machine. */
export async function setPaymentStatus(tx: Tx, order: OrderRow, to: PaymentStatus): Promise<OrderRow> {
  if (order.paymentStatus === to) return order;
  if (!isPaymentTransitionAllowed(order.paymentStatus, to)) {
    throw new DomainError("INVALID_PAYMENT_TRANSITION", `Payment cannot move from ${order.paymentStatus} to ${to}.`, 409);
  }
  const [updated] = await tx.update(orders).set({ paymentStatus: to }).where(eq(orders.id, order.id)).returning();
  return updated!;
}

/** Amount actually collected for an order (captured online, or cash collected on delivery). */
export async function paidAmount(tx: Tx, order: OrderRow): Promise<number> {
  if (order.paymentMethod === "COD") {
    return order.paymentStatus === "PAYMENT_SUCCESS" ||
      order.paymentStatus === "PAYMENT_PARTIALLY_REFUNDED" ||
      order.paymentStatus === "PAYMENT_REFUNDED"
      ? order.totalPaise
      : 0;
  }
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, "PAYMENT_SUCCESS"), eq(payments.isDuplicate, false)));
  return Number(row?.total ?? 0);
}

/**
 * Refunds against the order's real payment. Refunds of duplicate or late captures
 * return money that `paidAmount` never counted, so they are excluded here too.
 */
export async function refundedAmount(tx: Tx, orderId: string, statuses: RefundStatus[] = ["PENDING", "PROCESSING", "PROCESSED"]) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
    .from(refunds)
    .leftJoin(payments, eq(payments.id, refunds.paymentId))
    .where(
      and(eq(refunds.orderId, orderId), inArray(refunds.status, statuses), or(isNull(refunds.paymentId), eq(payments.isDuplicate, false))),
    );
  return Number(row?.total ?? 0);
}

const TOPIC_FOR_STATUS: Partial<Record<OrderStatus, NotificationTopic>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  CANCELLED: "ORDER_CANCELLED",
  REJECTED: "COD_REJECTED",
  SHIPPED: "SHIPPING_UPDATE",
  OUT_FOR_DELIVERY: "DELIVERY_UPDATE",
  DELIVERED: "DELIVERY_UPDATE",
};

/**
 * The only way an order changes status. Validates the transition against the
 * state machine for the given actor, applies inventory/coupon/refund side
 * effects, writes history, and queues customer notifications — all in the
 * caller's transaction.
 */
export async function transitionOrder(
  tx: Tx,
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  opts: { note?: string | null; now?: Date } = {},
): Promise<OrderRow> {
  const now = opts.now ?? new Date();
  const order = await lockOrder(tx, orderId);
  const verdict = evaluateOrderTransition(
    {
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      cancelDeadlineAt: order.cancelDeadlineAt,
    },
    to,
    actor,
    now,
  );
  if (!verdict.ok) throw new DomainError(verdict.code, verdict.message, verdict.code === "FORBIDDEN" ? 403 : 409);

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const patch: Partial<OrderRow> = { status: to };

  if (to === "CONFIRMED") {
    // Reservation becomes a real deduction.
    await lockInventory(
      tx,
      items.map((i) => i.variantId),
    );
    for (const item of items) {
      await applyMovement(tx, item.variantId, { kind: "COMMIT", quantity: item.quantity }, { orderId, note: order.orderNumber });
    }
    patch.confirmedAt = now;
  }

  if (to === "CANCELLED" || to === "REJECTED") {
    const wasReservation = RESERVATION_STATUSES.includes(order.status);
    await lockInventory(
      tx,
      items.map((i) => i.variantId),
    );
    for (const item of items) {
      await applyMovement(
        tx,
        item.variantId,
        wasReservation ? { kind: "RELEASE", quantity: item.quantity } : { kind: "RESTOCK_CANCELLED", quantity: item.quantity },
        { orderId, note: `${order.orderNumber} ${to.toLowerCase()}` },
      );
    }
    await releaseCoupons(tx, orderId);
    patch.cancelledAt = now;
    patch.cancelReason = opts.note ?? null;

    // Money already captured goes back automatically (processed by the refund worker).
    const paid = await paidAmount(tx, order);
    const owed = paid - (await refundedAmount(tx, orderId));
    if (paid > 0 && owed > 0) {
      const [payment] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.orderId, orderId), eq(payments.status, "PAYMENT_SUCCESS"), eq(payments.isDuplicate, false)))
        .limit(1);
      await tx.insert(refunds).values({
        orderId,
        paymentId: payment?.id ?? null,
        amountPaise: owed,
        method: "ORIGINAL_PAYMENT",
        status: "PENDING",
        reason: `Order ${to === "REJECTED" ? "rejected" : "cancelled"}: ${opts.note ?? "no reason given"}`,
      });
    } else if (order.paymentMethod === "COD" || order.paymentStatus !== "PAYMENT_SUCCESS") {
      // Nothing was collected: close out the pending payment.
      if (isPaymentTransitionAllowed(order.paymentStatus, "PAYMENT_FAILED")) patch.paymentStatus = "PAYMENT_FAILED";
      await tx
        .update(payments)
        .set({ status: "PAYMENT_FAILED", failureReason: `Order ${to.toLowerCase()}` })
        .where(and(eq(payments.orderId, orderId), inArray(payments.status, ["PAYMENT_INITIATED", "PAYMENT_PENDING"])));
    }
    await recordEvent({ type: "ORDER_CANCELLED", userId: order.userId, orderId, metadata: { by: actor.type, to } }, tx);
  }

  if (to === "SHIPPED") {
    const [shipment] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.orderId, orderId)).limit(1);
    if (!shipment) throw new DomainError("SHIPMENT_REQUIRED", "Add the courier and AWB before marking as shipped.", 422);
    await tx.update(shipments).set({ status: "IN_TRANSIT", shippedAt: now }).where(eq(shipments.orderId, orderId));
  }

  if (to === "OUT_FOR_DELIVERY") {
    await tx.update(shipments).set({ status: "OUT_FOR_DELIVERY" }).where(eq(shipments.orderId, orderId));
  }

  if (to === "DELIVERED") {
    patch.deliveredAt = now;
    // RULE 6: return window computed server-side from the delivery timestamp.
    patch.returnDeadlineAt = computeReturnDeadline(now, env.RETURN_WINDOW_DAYS);
    await tx.update(shipments).set({ status: "DELIVERED", deliveredAt: now }).where(eq(shipments.orderId, orderId));
    // Cash on delivery is collected by the courier at the doorstep.
    if (order.paymentMethod === "COD" && order.paymentStatus === "PAYMENT_PENDING") {
      patch.paymentStatus = "PAYMENT_SUCCESS";
      await tx
        .update(payments)
        .set({ status: "PAYMENT_SUCCESS", verifiedAt: now })
        .where(and(eq(payments.orderId, orderId), eq(payments.provider, "cod")));
    }
    await recordEvent({ type: "ORDER_DELIVERED", userId: order.userId, orderId }, tx);
  }

  const [updated] = await tx.update(orders).set(patch).where(eq(orders.id, orderId)).returning();
  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: order.status,
    toStatus: to,
    actorType: actor.type,
    actorId: actorId(actor),
    note: opts.note ?? null,
    createdAt: now,
  });

  const topic = order.status === "PENDING_COD_APPROVAL" && to === "CONFIRMED" ? "COD_APPROVED" : TOPIC_FOR_STATUS[to];
  if (topic) {
    const [shipment] = to === "SHIPPED" ? await tx.select().from(shipments).where(eq(shipments.orderId, orderId)).limit(1) : [];
    await queueNotification(tx, {
      userId: order.userId,
      topic,
      orderId,
      payload: {
        orderNumber: order.orderNumber,
        name: order.shippingAddress.fullName,
        total: formatINR(order.totalPaise),
        status: to.replace(/_/g, " ").toLowerCase(),
        reason: opts.note ?? "",
        courier: shipment?.courierName ?? "",
        awb: shipment?.awb ?? "",
      },
    });
  }
  return updated!;
}
