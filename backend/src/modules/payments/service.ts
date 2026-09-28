import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import type { PlaceOrderResultDTO } from "../../contracts/dto";
import { formatINR } from "../../contracts/money";
import { db, type Tx } from "../../db/client";
import { orders, paymentEvents, payments, refunds, returns, users } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { providers } from "../../integrations";
import type { VerifiedPaymentEvent } from "../../integrations/payments/types";
import { logger } from "../../lib/logger";
import { captureException } from "../../lib/monitoring";
import { recordEvent } from "../events/service";
import { kickNotificationDispatch, queueNotification } from "../notifications/service";
import { lockOrder, paidAmount, refundedAmount, setPaymentStatus, transitionOrder } from "../orders/lifecycle";

/**
 * Creates (or reuses) a gateway payment session for a prepaid order awaiting
 * payment. Retries after a failed attempt create a fresh gateway order.
 */
export async function initiatePayment(orderId: string): Promise<NonNullable<PlaceOrderResultDTO["payment"]>> {
  const [order] = await db
    .select({ order: orders, phone: users.phone, name: users.fullName, email: users.email })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId));
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
  const o = order.order;
  if (o.status !== "PENDING_PAYMENT") throw new DomainError("PAYMENT_NOT_REQUIRED", "This order doesn't need payment.", 409);
  if (o.paymentExpiresAt && o.paymentExpiresAt < new Date()) {
    throw new DomainError("PAYMENT_EXPIRED", "The payment window for this order has closed.", 409);
  }

  const [open] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, o.id), inArray(payments.status, ["PAYMENT_INITIATED", "PAYMENT_PENDING"])))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const session = {
    orderId: o.id,
    orderNumber: o.orderNumber,
    amountPaise: o.totalPaise,
    currency: "INR" as const,
    customer: { name: order.name ?? o.shippingAddress.fullName, phone: order.phone, email: order.email },
  };
  // Resume the open attempt (same gateway order) rather than creating a second one the customer could also pay.
  if (open?.providerOrderId && open.provider === providers.payments.name) {
    return {
      provider: open.provider,
      clientCheckout: providers.payments.checkoutFor({ ...session, amountPaise: open.amountPaise, providerOrderId: open.providerOrderId }),
    };
  }

  const created = await providers.payments.createPayment(session);
  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      orderId: o.id,
      provider: providers.payments.name,
      providerOrderId: created.providerOrderId,
      amountPaise: o.totalPaise,
      status: "PAYMENT_PENDING",
    });
    await setPaymentStatus(tx, await lockOrder(tx, o.id), "PAYMENT_PENDING");
    await recordEvent({ type: "PAYMENT_STARTED", userId: o.userId, orderId: o.id, metadata: { provider: providers.payments.name } }, tx);
  });
  return { provider: providers.payments.name, clientCheckout: { ...created.clientCheckout, orderNumber: o.orderNumber } };
}

/**
 * RULE 10: the single handler for verified gateway events (webhooks and signed
 * client callbacks). Idempotent: each provider event id is processed once.
 */
export async function handleVerifiedPaymentEvent(event: VerifiedPaymentEvent): Promise<{ duplicate: boolean }> {
  const duplicate = await db.transaction(async (tx) => {
    // The dedupe row commits together with its effects: if processing fails,
    // the gateway's retry is processed again instead of being dropped.
    const [logged] = await tx
      .insert(paymentEvents)
      .values({ provider: providers.payments.name, providerEventId: event.eventId, eventType: event.type, payload: event.raw })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (!logged) return true;
    await applyPaymentEvent(tx, event, logged.id);
    await tx.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, logged.id));
    return false;
  });
  if (duplicate) {
    logger.info("payment_event_duplicate", { eventId: event.eventId });
    return { duplicate: true };
  }
  kickNotificationDispatch();
  kickRefundProcessor();
  return { duplicate: false };
}

async function applyPaymentEvent(tx: Tx, event: VerifiedPaymentEvent, eventRowId: string) {
  if (event.type === "refund.processed" || event.type === "refund.failed") {
    if (event.providerRefundId) await settleRefund(tx, event.providerRefundId, event.type === "refund.processed", event.failureReason);
    return;
  }

  const [payment] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, providers.payments.name), eq(payments.providerOrderId, event.providerOrderId)))
    .for("update");
  if (!payment) {
    logger.warn("payment_event_unknown_order", { providerOrderId: event.providerOrderId });
    return;
  }
  await tx.update(paymentEvents).set({ paymentId: payment.id }).where(eq(paymentEvents.id, eventRowId));
  const order = await lockOrder(tx, payment.orderId);

  if (event.type === "payment.failed") {
    if (payment.status === "PAYMENT_SUCCESS") return; // a late failure never overrides a capture
    await tx
      .update(payments)
      .set({
        status: "PAYMENT_FAILED",
        failureReason: event.failureReason ?? "Payment failed",
        providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
      })
      .where(eq(payments.id, payment.id));
    if (order.paymentStatus !== "PAYMENT_SUCCESS" && order.status === "PENDING_PAYMENT") {
      await setPaymentStatus(tx, order, "PAYMENT_FAILED");
    }
    await recordEvent(
      { type: "PAYMENT_FAILED", userId: order.userId, orderId: order.id, metadata: { reason: event.failureReason ?? "unknown" } },
      tx,
    );
    return;
  }

  // payment.captured
  if (payment.status === "PAYMENT_SUCCESS") return; // already applied via the other channel
  if (event.amountPaise !== null && event.amountPaise !== payment.amountPaise) {
    // Never confirm an order on an amount mismatch — flag for manual review.
    await tx
      .update(payments)
      .set({ failureReason: `Amount mismatch: captured ${event.amountPaise}, expected ${payment.amountPaise}` })
      .where(eq(payments.id, payment.id));
    logger.error("payment_amount_mismatch", { paymentId: payment.id, captured: event.amountPaise, expected: payment.amountPaise });
    return;
  }

  const alreadyPaid = order.paymentStatus === "PAYMENT_SUCCESS" || order.status !== "PENDING_PAYMENT";
  await tx
    .update(payments)
    .set({
      status: "PAYMENT_SUCCESS",
      providerPaymentId: event.providerPaymentId,
      verifiedAt: new Date(),
      failureReason: null,
      isDuplicate: alreadyPaid,
    })
    .where(eq(payments.id, payment.id));

  if (alreadyPaid) {
    // Duplicate capture, or a late capture on an expired/cancelled order: return the money.
    await tx.insert(refunds).values({
      orderId: order.id,
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      method: "ORIGINAL_PAYMENT",
      status: "PENDING",
      reason:
        order.paymentStatus === "PAYMENT_SUCCESS" ? "Duplicate payment" : `Payment received after order was ${order.status.toLowerCase()}`,
    });
    logger.warn("payment_duplicate_or_late", { orderId: order.id, paymentId: payment.id });
    return;
  }

  await setPaymentStatus(tx, order, "PAYMENT_SUCCESS");
  // RULE 1: verified prepaid payment confirms the order automatically — no admin approval.
  await transitionOrder(tx, order.id, "CONFIRMED", { type: "SYSTEM", reason: "payment_verified" }, { note: "Payment verified" });
  await recordEvent({ type: "PAYMENT_SUCCESS", userId: order.userId, orderId: order.id, metadata: { amount: payment.amountPaise } }, tx);
}

/** Verifies the storefront's post-checkout callback for the customer's own order. */
export async function verifyClientCallback(userId: string, orderNumber: string, payload: Record<string, unknown>) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.userId, userId)));
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
  const event = await providers.payments.verifyClientCallback(payload);
  if (!event) throw new DomainError("PAYMENT_VERIFICATION_FAILED", "We couldn't verify this payment.", 422);
  const [payment] = await db
    .select({ orderId: payments.orderId })
    .from(payments)
    .where(and(eq(payments.providerOrderId, event.providerOrderId), eq(payments.orderId, order.id)));
  if (!payment) throw new DomainError("PAYMENT_VERIFICATION_FAILED", "Payment does not belong to this order.", 422);
  await handleVerifiedPaymentEvent(event);
  const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
  return { orderNumber: fresh!.orderNumber, status: fresh!.status, paymentStatus: fresh!.paymentStatus };
}

/* ────────────────────────────────── Refunds ─────────────────────────────── */

async function syncOrderRefundStatus(tx: Tx, orderId: string) {
  const order = await lockOrder(tx, orderId);
  const paid = await paidAmount(tx, order);
  const refunded = await refundedAmount(tx, orderId, ["PROCESSED"]);
  if (paid <= 0 || refunded <= 0) return;
  const target = refunded >= paid ? "PAYMENT_REFUNDED" : "PAYMENT_PARTIALLY_REFUNDED";
  if (order.paymentStatus !== target && order.paymentStatus !== "PAYMENT_REFUNDED") await setPaymentStatus(tx, order, target);
}

async function settleRefund(tx: Tx, providerRefundId: string, success: boolean, failureReason: string | null) {
  const [refund] = await tx.select().from(refunds).where(eq(refunds.providerRefundId, providerRefundId)).for("update");
  if (!refund || refund.status === "PROCESSED") return;
  await markRefund(tx, refund, success, failureReason);
}

export async function markRefund(
  tx: Tx,
  refund: typeof refunds.$inferSelect,
  success: boolean,
  failureReason: string | null,
  reference?: string,
) {
  await tx
    .update(refunds)
    .set(
      success
        ? { status: "PROCESSED", processedAt: new Date(), ...(reference ? { providerRefundId: reference } : {}) }
        : { status: "FAILED", failureReason },
    )
    .where(eq(refunds.id, refund.id));
  if (!success) return;
  await syncOrderRefundStatus(tx, refund.orderId);
  if (refund.returnId) {
    await tx
      .update(returns)
      .set({ status: "COMPLETED", resolvedAt: new Date() })
      .where(and(eq(returns.id, refund.returnId), eq(returns.status, "REFUND_INITIATED")));
  }
  const [order] = await tx.select().from(orders).where(eq(orders.id, refund.orderId));
  await queueNotification(tx, {
    userId: order!.userId,
    topic: "REFUND_UPDATE",
    orderId: refund.orderId,
    payload: { amount: formatINR(refund.amountPaise), orderNumber: order!.orderNumber, status: "processed" },
  });
}

/**
 * Refund worker: sends PENDING original-method refunds to the gateway. Bank/UPI
 * refunds (COD orders) stay PENDING until an admin records the transfer.
 */
export async function processPendingRefunds(limit = 20) {
  const pending = await db
    .select({ refund: refunds, providerPaymentId: payments.providerPaymentId, provider: payments.provider })
    .from(refunds)
    .leftJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(eq(refunds.status, "PENDING"), eq(refunds.method, "ORIGINAL_PAYMENT")))
    .orderBy(asc(refunds.createdAt))
    .limit(limit);

  for (const { refund, providerPaymentId, provider } of pending) {
    if (!providerPaymentId || provider === "cod") continue;
    try {
      const claimed = await db
        .update(refunds)
        .set({ status: "PROCESSING" })
        .where(and(eq(refunds.id, refund.id), eq(refunds.status, "PENDING")))
        .returning();
      if (claimed.length === 0) continue; // another worker took it
      const result = await providers.payments.refund({ providerPaymentId, amountPaise: refund.amountPaise, reason: refund.reason });
      await db.transaction(async (tx) => {
        await tx.update(refunds).set({ providerRefundId: result.providerRefundId }).where(eq(refunds.id, refund.id));
        if (result.status === "PROCESSED") await markRefund(tx, { ...refund, providerRefundId: result.providerRefundId }, true, null);
      });
    } catch (error) {
      captureException(error, { refundId: refund.id });
      await db
        .update(refunds)
        .set({ status: "PENDING", failureReason: String(error).slice(0, 300) })
        .where(eq(refunds.id, refund.id));
    }
  }
  kickNotificationDispatch();
}

let refundTimer: NodeJS.Timeout | null = null;
export function kickRefundProcessor() {
  if (refundTimer) return;
  refundTimer = setTimeout(() => {
    refundTimer = null;
    processPendingRefunds().catch((e) => captureException(e, { job: "refunds" }));
  }, 250);
  refundTimer.unref();
}

/* ─────────────────────────────── Payment timeout ─────────────────────────── */

/** Cancels prepaid orders whose payment window lapsed, releasing their stock. */
export async function expireUnpaidOrders() {
  const expired = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "PENDING_PAYMENT"), lt(orders.paymentExpiresAt, new Date())))
    .limit(100);
  for (const { id } of expired) {
    try {
      await db.transaction(async (tx) => {
        await transitionOrder(
          tx,
          id,
          "CANCELLED",
          { type: "SYSTEM", reason: "payment_timeout" },
          { note: "Payment not completed in time" },
        );
      });
    } catch (error) {
      captureException(error, { job: "expire_unpaid", orderId: id });
    }
  }
  if (expired.length) kickNotificationDispatch();
  return expired.length;
}
