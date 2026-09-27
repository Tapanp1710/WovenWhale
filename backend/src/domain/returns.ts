import type { OrderStatus, ReturnStatus, ReturnType } from "../contracts/enums";
import { fail, ok, type Result } from "./errors";

/**
 * Return / exchange / refund request lifecycle.
 *
 *  REQUESTED ─┬─> APPROVED ─> RECEIVED ─┬─> REFUND_INITIATED ─> COMPLETED   (RETURN)
 *             │       │                 └─> COMPLETED                      (EXCHANGE)
 *             │       └─> REFUND_INITIATED ─> COMPLETED                     (REFUND — no pickup)
 *             ├─> INFO_REQUESTED ─> REQUESTED (customer replies) | APPROVED | REJECTED
 *             ├─> REJECTED
 *             └─> CANCELLED (customer withdraws)
 */
export const RETURN_TRANSITIONS: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> = {
  REQUESTED: ["APPROVED", "REJECTED", "INFO_REQUESTED", "CANCELLED"],
  INFO_REQUESTED: ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "REFUND_INITIATED"],
  RECEIVED: ["REFUND_INITIATED", "COMPLETED"],
  REFUND_INITIATED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

/** Requests in these statuses still "hold" item quantities against new requests. */
export const OPEN_OR_ACCEPTED_RETURN_STATUSES: readonly ReturnStatus[] = [
  "REQUESTED",
  "INFO_REQUESTED",
  "APPROVED",
  "RECEIVED",
  "REFUND_INITIATED",
  "COMPLETED",
];

export function evaluateReturnTransition(
  current: { status: ReturnStatus; type: ReturnType },
  to: ReturnStatus,
  actor: "CUSTOMER" | "ADMIN",
): Result {
  if (!RETURN_TRANSITIONS[current.status].includes(to)) {
    return fail("INVALID_TRANSITION", `A request cannot move from ${current.status} to ${to}.`);
  }
  if (actor === "CUSTOMER" && !(to === "CANCELLED" || (current.status === "INFO_REQUESTED" && to === "REQUESTED"))) {
    return fail("FORBIDDEN", "Only WovenWhale can update this request.");
  }
  if (actor === "ADMIN" && (to === "CANCELLED" || (current.status === "INFO_REQUESTED" && to === "REQUESTED"))) {
    return fail("FORBIDDEN", "Only the customer can withdraw or reply to a request.");
  }
  // Refunds without pickup skip RECEIVED; returns must be received first.
  if (current.status === "APPROVED" && to === "REFUND_INITIATED" && current.type !== "REFUND") {
    return fail("ITEM_NOT_RECEIVED", "Mark the returned item as received before refunding.");
  }
  if (current.status === "APPROVED" && to === "RECEIVED" && current.type === "REFUND") {
    return fail("INVALID_TRANSITION", "Refund-only requests have no item to receive.");
  }
  if (current.status === "RECEIVED" && to === "COMPLETED" && current.type !== "EXCHANGE") {
    return fail("REFUND_REQUIRED", "Initiate the refund before completing this return.");
  }
  if (current.status === "RECEIVED" && to === "REFUND_INITIATED" && current.type === "EXCHANGE") {
    return fail("INVALID_TRANSITION", "Exchanges are completed, not refunded.");
  }
  return ok(undefined);
}

/** RULE 6: eligibility is decided server-side from the stored return deadline. */
export function evaluateReturnEligibility(order: { status: OrderStatus; returnDeadlineAt: Date | null }, now: Date): Result {
  if (order.status !== "DELIVERED" || !order.returnDeadlineAt) {
    return fail("RETURN_NOT_AVAILABLE", "Returns open once your order has been delivered.");
  }
  if (now.getTime() > order.returnDeadlineAt.getTime()) {
    return fail("RETURN_WINDOW_EXPIRED", "The 14-day return window for this order has closed.");
  }
  return ok(undefined);
}

export interface RefundableLine {
  orderItemId: string;
  quantity: number;
  lineTotalPaise: number;
}

/**
 * Refund owed for returning `quantity` units of a line: the customer gets back
 * exactly what they paid for those units (price minus allocated coupon discount).
 * The last unit absorbs rounding so a full return refunds the line total exactly.
 */
export function refundForLine(line: RefundableLine, quantity: number, alreadyReturnedQty: number): number {
  if (quantity <= 0) return 0;
  const perUnit = Math.floor(line.lineTotalPaise / line.quantity);
  const returnedAfter = alreadyReturnedQty + quantity;
  if (returnedAfter >= line.quantity) {
    // Refund whatever remains of the line so totals reconcile exactly.
    return line.lineTotalPaise - perUnit * alreadyReturnedQty;
  }
  return perUnit * quantity;
}

/** Caps a refund so total refunds never exceed what was actually paid. */
export function capRefund(requestedPaise: number, paidPaise: number, alreadyRefundedPaise: number): number {
  return Math.max(0, Math.min(requestedPaise, paidPaise - alreadyRefundedPaise));
}
