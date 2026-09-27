import { and, eq, inArray, sql } from "drizzle-orm";
import type { AdminContext } from "../../app-env";
import type { RefundMethod, ReturnStatus } from "../../contracts/enums";
import { formatINR } from "../../contracts/money";
import { RETURN_STATUS_LABELS } from "../../contracts/labels";
import type { createReturnSchema } from "../../contracts/storefront";
import { db, type Tx } from "../../db/client";
import { inventory, orderItems, orders, payments, productVariants, refunds, returnItems, returns } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { capRefund, evaluateReturnEligibility, evaluateReturnTransition, refundForLine } from "../../domain/returns";
import { recordAudit } from "../../lib/audit";
import { humanReference } from "../../lib/crypto";
import { recordEvent } from "../events/service";
import { applyMovement, lockInventory } from "../inventory/service";
import { kickNotificationDispatch, queueNotification } from "../notifications/service";
import { lockOrder, paidAmount, refundedAmount } from "../orders/lifecycle";
import { claimedReturnQuantities } from "../orders/queries";
import { kickRefundProcessor } from "../payments/service";
import type { z } from "zod";

type ReturnRow = typeof returns.$inferSelect;

async function lockReturn(tx: Tx, returnId: string): Promise<ReturnRow> {
  const [row] = await tx.select().from(returns).where(eq(returns.id, returnId)).for("update");
  if (!row) throw new DomainError("RETURN_NOT_FOUND", "Request not found.", 404);
  return row;
}

async function notifyReturn(tx: Tx, r: ReturnRow, status: ReturnStatus) {
  await queueNotification(tx, {
    userId: r.userId,
    topic: "RETURN_UPDATE",
    orderId: r.orderId,
    payload: { returnNumber: r.returnNumber, status: RETURN_STATUS_LABELS[status] },
  });
}

/* ──────────────────────────────── Customer ───────────────────────────────── */

export async function createReturn(userId: string, orderNumber: string, input: z.output<typeof createReturnSchema>) {
  const result = await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.orderNumber, orderNumber), eq(orders.userId, userId)));
    if (!owned) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
    const order = await lockOrder(tx, owned.id); // serialises concurrent requests on the same order

    // RULE 6: eligibility from the server-stored deadline, never the client clock.
    const eligibility = evaluateReturnEligibility(order, new Date());
    if (!eligibility.ok) throw new DomainError(eligibility.code, eligibility.message, 422);

    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const claimed = await claimedReturnQuantities(order.id);
    const merged = new Map<string, { quantity: number; exchangeVariantId?: string }>();
    for (const item of input.items) {
      const prev = merged.get(item.orderItemId);
      merged.set(item.orderItemId, { quantity: (prev?.quantity ?? 0) + item.quantity, exchangeVariantId: item.exchangeVariantId });
    }

    for (const [orderItemId, req] of merged) {
      const line = lines.find((l) => l.id === orderItemId);
      if (!line) throw new DomainError("INVALID_ITEM", "One of the selected items is not part of this order.", 422);
      const remaining = line.quantity - (claimed.get(orderItemId) ?? 0);
      if (req.quantity > remaining) {
        throw new DomainError("RETURN_QUANTITY_EXCEEDED", `Only ${remaining} unit(s) of ${line.productName} can be returned.`, 422);
      }
      if (input.type === "EXCHANGE") {
        if (!req.exchangeVariantId) throw new DomainError("EXCHANGE_SIZE_REQUIRED", "Choose the size you'd like instead.", 422);
        const [variant] = await tx
          .select({
            productId: productVariants.productId,
            available: sql<number>`coalesce(${inventory.onHand} - ${inventory.reserved}, 0)::int`,
          })
          .from(productVariants)
          .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
          .where(and(eq(productVariants.id, req.exchangeVariantId), eq(productVariants.isActive, true)));
        if (!variant || variant.productId !== line.productId) {
          throw new DomainError("EXCHANGE_INVALID", "Exchanges are for a different size of the same product.", 422);
        }
        if (Number(variant.available) < req.quantity) {
          throw new DomainError("EXCHANGE_OUT_OF_STOCK", "That size is out of stock. Choose a return instead.", 409);
        }
      }
    }

    const [created] = await tx
      .insert(returns)
      .values({
        returnNumber: humanReference("RT", 8),
        orderId: order.id,
        userId,
        type: input.type,
        reason: input.reason,
        customerNote: input.note || null,
      })
      .returning();
    await tx.insert(returnItems).values(
      [...merged].map(([orderItemId, req]) => ({
        returnId: created!.id,
        orderItemId,
        quantity: req.quantity,
        exchangeVariantId: input.type === "EXCHANGE" ? req.exchangeVariantId : null,
      })),
    );
    await recordEvent({ type: "RETURN_REQUESTED", userId, orderId: order.id, metadata: { type: input.type, reason: input.reason } }, tx);
    await notifyReturn(tx, created!, "REQUESTED");
    return created!;
  });
  kickNotificationDispatch();
  return result;
}

async function customerTransition(userId: string, returnNumber: string, to: ReturnStatus, message?: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: returns.id })
      .from(returns)
      .where(and(eq(returns.returnNumber, returnNumber), eq(returns.userId, userId)));
    if (!row) throw new DomainError("RETURN_NOT_FOUND", "Request not found.", 404);
    const r = await lockReturn(tx, row.id);
    const verdict = evaluateReturnTransition(r, to, "CUSTOMER");
    if (!verdict.ok) throw new DomainError(verdict.code, verdict.message, 409);
    await tx
      .update(returns)
      .set({
        status: to,
        ...(message ? { customerNote: [r.customerNote, `Reply: ${message}`].filter(Boolean).join("\n\n") } : {}),
        ...(to === "CANCELLED" ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(returns.id, r.id));
  });
}

export const replyToInfoRequest = (userId: string, returnNumber: string, message: string) =>
  customerTransition(userId, returnNumber, "REQUESTED", message);
export const withdrawReturn = (userId: string, returnNumber: string) => customerTransition(userId, returnNumber, "CANCELLED");

/* ─────────────────────────────────── Admin ───────────────────────────────── */

/** Refund owed for a request: what the customer paid for exactly those units. */
export async function refundableForReturn(tx: Tx, r: ReturnRow) {
  const items = await tx
    .select({ ri: returnItems, line: orderItems })
    .from(returnItems)
    .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
    .where(eq(returnItems.returnId, r.id));
  // Units of each line already refunded by earlier requests on this order.
  const prior = await tx
    .select({ orderItemId: returnItems.orderItemId, qty: sql<number>`sum(${returnItems.quantity})::int` })
    .from(returnItems)
    .innerJoin(returns, eq(returns.id, returnItems.returnId))
    .where(
      and(
        eq(returns.orderId, r.orderId),
        inArray(returns.status, ["REFUND_INITIATED", "COMPLETED"]),
        sql`${returns.id} <> ${r.id}`,
        sql`${returns.type} <> 'EXCHANGE'`,
      ),
    )
    .groupBy(returnItems.orderItemId);
  const priorBy = new Map(prior.map((p) => [p.orderItemId, Number(p.qty)]));
  return items.reduce(
    (sum, { ri, line }) =>
      sum +
      refundForLine(
        { orderItemId: line.id, quantity: line.quantity, lineTotalPaise: line.lineTotalPaise },
        ri.quantity,
        priorBy.get(line.id) ?? 0,
      ),
    0,
  );
}

export async function adminTransitionReturn(
  admin: AdminContext,
  returnId: string,
  input: {
    to: "APPROVED" | "REJECTED" | "INFO_REQUESTED" | "RECEIVED" | "COMPLETED";
    note?: string;
    infoRequest?: string;
    restock: boolean;
  },
) {
  await db.transaction(async (tx) => {
    const before = await lockReturn(tx, returnId);
    const verdict = evaluateReturnTransition(before, input.to, "ADMIN");
    if (!verdict.ok) throw new DomainError(verdict.code, verdict.message, 409);
    if (input.to === "INFO_REQUESTED" && !input.infoRequest) {
      throw new DomainError("INFO_REQUEST_REQUIRED", "Tell the customer what information you need.", 422);
    }

    const items = await tx
      .select({ ri: returnItems, variantId: orderItems.variantId })
      .from(returnItems)
      .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
      .where(eq(returnItems.returnId, returnId));

    if (input.to === "RECEIVED") {
      await lockInventory(
        tx,
        items.map((i) => i.variantId),
      );
      for (const { ri, variantId } of items) {
        await tx.update(returnItems).set({ restock: input.restock }).where(eq(returnItems.id, ri.id));
        if (input.restock) {
          await applyMovement(
            tx,
            variantId,
            { kind: "RETURN_RECEIVED", quantity: ri.quantity },
            { returnId, adminUserId: admin.id, note: before.returnNumber },
          );
        }
      }
    }
    if (input.to === "COMPLETED" && before.type === "EXCHANGE") {
      // Dispatch the replacement size.
      await lockInventory(tx, items.map((i) => i.ri.exchangeVariantId!).filter(Boolean));
      for (const { ri } of items) {
        if (!ri.exchangeVariantId) continue;
        await applyMovement(
          tx,
          ri.exchangeVariantId,
          { kind: "DISPATCH", quantity: ri.quantity },
          { returnId, adminUserId: admin.id, note: `Exchange ${before.returnNumber}` },
        );
      }
    }

    const terminal = input.to === "REJECTED" || input.to === "COMPLETED";
    const [after] = await tx
      .update(returns)
      .set({
        status: input.to,
        adminNote: input.note ?? before.adminNote,
        ...(input.to === "INFO_REQUESTED" ? { infoRequest: input.infoRequest } : {}),
        ...(terminal ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(returns.id, returnId))
      .returning();
    await recordAudit(tx, admin, { action: `return.${input.to.toLowerCase()}`, entityType: "return", entityId: returnId, before, after });
    await notifyReturn(tx, after!, input.to);
  });
  kickNotificationDispatch();
}

/** "Approve refund": computes the refundable amount server-side and issues the refund. */
export async function approveReturnRefund(
  admin: AdminContext,
  returnId: string,
  input: { method: RefundMethod; amount?: number; note?: string },
) {
  await db.transaction(async (tx) => {
    const r = await lockReturn(tx, returnId);
    const verdict = evaluateReturnTransition(r, "REFUND_INITIATED", "ADMIN");
    if (!verdict.ok) throw new DomainError(verdict.code, verdict.message, 409);

    const order = await lockOrder(tx, r.orderId);
    const paid = await paidAmount(tx, order);
    const computed = await refundableForReturn(tx, r);
    const requested = input.amount ?? computed;
    if (requested > computed) {
      throw new DomainError("REFUND_EXCEEDS_ITEMS", `Refund can't exceed ${formatINR(computed)} for these items.`, 422);
    }
    const amount = capRefund(requested, paid, await refundedAmount(tx, order.id));
    if (amount <= 0) throw new DomainError("NOTHING_TO_REFUND", "There is no paid amount left to refund on this order.", 422);
    if (input.method === "ORIGINAL_PAYMENT" && order.paymentMethod === "COD") {
      throw new DomainError("REFUND_METHOD_INVALID", "COD orders are refunded by bank transfer or UPI.", 422);
    }

    const [payment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, "PAYMENT_SUCCESS"), eq(payments.isDuplicate, false)))
      .limit(1);
    const [refund] = await tx
      .insert(refunds)
      .values({
        orderId: order.id,
        returnId,
        paymentId: payment?.id ?? null,
        amountPaise: amount,
        method: input.method,
        status: "PENDING",
        reason: `Return ${r.returnNumber}${input.note ? `: ${input.note}` : ""}`,
        approvedByAdminId: admin.id,
      })
      .returning();
    const [after] = await tx.update(returns).set({ status: "REFUND_INITIATED" }).where(eq(returns.id, returnId)).returning();
    await recordAudit(tx, admin, { action: "refund.approved", entityType: "refund", entityId: refund!.id, after: refund });
    await recordAudit(tx, admin, { action: "return.refund_initiated", entityType: "return", entityId: returnId, before: r, after });
    await queueNotification(tx, {
      userId: r.userId,
      topic: "REFUND_UPDATE",
      orderId: order.id,
      payload: { amount: formatINR(amount), orderNumber: order.orderNumber, status: "initiated" },
    });
  });
  kickRefundProcessor();
  kickNotificationDispatch();
}
