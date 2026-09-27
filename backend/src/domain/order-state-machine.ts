import type { OrderStatus, PaymentMethod, PaymentStatus, Permission } from "../contracts/enums";
import { fail, ok, type Result } from "./errors";

/**
 * Order fulfilment state machine.
 *
 * Prepaid: PENDING_PAYMENT → (payment verified) → CONFIRMED → PROCESSING → PACKED
 *          → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
 * COD:     PENDING_COD_APPROVAL → (admin approves) → CONFIRMED → … → DELIVERED
 *          PENDING_COD_APPROVAL → (admin rejects)  → REJECTED
 *
 * Payment status lives in a separate machine (see PAYMENT_TRANSITIONS).
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  PENDING_COD_APPROVAL: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ["DELIVERED", "CANCELLED", "REJECTED"];

/** Statuses from which a customer may self-cancel (still subject to the 12h window). */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "PENDING_COD_APPROVAL",
  "CONFIRMED",
  "PROCESSING",
];

/** Statuses in which stock is held as a reservation (not yet deducted from on-hand). */
export const RESERVATION_STATUSES: readonly OrderStatus[] = ["PENDING_PAYMENT", "PENDING_COD_APPROVAL"];

/** Fulfilment steps an admin (or a shipping webhook) drives. */
export const FULFILMENT_STATUSES: readonly OrderStatus[] = ["PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

export type Actor =
  | { type: "CUSTOMER"; id: string }
  | { type: "ADMIN"; id: string; permissions: ReadonlySet<Permission> }
  | { type: "SYSTEM"; reason: string };

export interface OrderSnapshot {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  cancelDeadlineAt: Date;
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Decides whether `actor` may move `order` to `to` at time `now`.
 * Encodes every mandatory business rule — callers must not re-implement them.
 */
export function evaluateOrderTransition(order: OrderSnapshot, to: OrderStatus, actor: Actor, now: Date): Result {
  if (!isTransitionAllowed(order.status, to)) {
    return fail("INVALID_TRANSITION", `An order cannot move from ${order.status} to ${to}.`);
  }
  const can = (p: Permission) => actor.type === "ADMIN" && actor.permissions.has(p);

  // RULE 1 / RULE 10 — prepaid orders confirm only after server-verified payment, automatically.
  if (order.status === "PENDING_PAYMENT" && to === "CONFIRMED") {
    if (actor.type !== "SYSTEM") return fail("FORBIDDEN", "Prepaid orders are confirmed by verified payment only.");
    if (order.paymentStatus !== "PAYMENT_SUCCESS") return fail("PAYMENT_NOT_VERIFIED", "Payment has not been verified.");
    return ok(undefined);
  }

  // RULE 2 / RULE 3 — COD orders require explicit approval or rejection by an authorised admin.
  if (order.status === "PENDING_COD_APPROVAL" && (to === "CONFIRMED" || to === "REJECTED")) {
    if (order.paymentMethod !== "COD") return fail("INVALID_TRANSITION", "Only COD orders require approval.");
    if (!can("orders.approve_cod")) return fail("FORBIDDEN", "You are not allowed to approve or reject COD orders.");
    return ok(undefined);
  }

  if (to === "CANCELLED") {
    switch (actor.type) {
      case "CUSTOMER":
        // RULE 5 — customers may cancel only within the server-computed window.
        if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
          return fail("CANCEL_NOT_ALLOWED", "This order can no longer be cancelled.");
        }
        if (now.getTime() > order.cancelDeadlineAt.getTime()) {
          return fail("CANCEL_WINDOW_EXPIRED", "The cancellation window for this order has closed.");
        }
        return ok(undefined);
      case "ADMIN":
        if (!can("orders.cancel_override")) return fail("FORBIDDEN", "You are not allowed to cancel orders.");
        return ok(undefined);
      case "SYSTEM":
        // Automated cancellation is limited to unpaid prepaid orders (payment timeout).
        if (order.status !== "PENDING_PAYMENT") return fail("FORBIDDEN", "System may only cancel unpaid orders.");
        return ok(undefined);
    }
  }

  if (FULFILMENT_STATUSES.includes(to)) {
    if (actor.type === "CUSTOMER") return fail("FORBIDDEN", "Customers cannot change fulfilment status.");
    if (actor.type === "ADMIN" && !can("orders.manage")) return fail("FORBIDDEN", "You are not allowed to update orders.");
    return ok(undefined);
  }

  return fail("INVALID_TRANSITION", `Unsupported transition to ${to}.`);
}

export function customerCanCancel(order: OrderSnapshot, now: Date): boolean {
  return evaluateOrderTransition(order, "CANCELLED", { type: "CUSTOMER", id: "self" }, now).ok;
}

/* ───────────────────────────── Payment machine ───────────────────────────── */

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PAYMENT_INITIATED: ["PAYMENT_PENDING", "PAYMENT_SUCCESS", "PAYMENT_FAILED"],
  PAYMENT_PENDING: ["PAYMENT_SUCCESS", "PAYMENT_FAILED"],
  // A failed attempt can be retried, and gateways can deliver a late success.
  PAYMENT_FAILED: ["PAYMENT_INITIATED", "PAYMENT_PENDING", "PAYMENT_SUCCESS"],
  PAYMENT_SUCCESS: ["PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUNDED"],
  PAYMENT_PARTIALLY_REFUNDED: ["PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUNDED"],
  PAYMENT_REFUNDED: [],
};

export function isPaymentTransitionAllowed(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Initial statuses for a freshly created order. */
export function initialStatuses(method: PaymentMethod): { status: OrderStatus; paymentStatus: PaymentStatus } {
  return method === "COD"
    ? { status: "PENDING_COD_APPROVAL", paymentStatus: "PAYMENT_PENDING" }
    : { status: "PENDING_PAYMENT", paymentStatus: "PAYMENT_INITIATED" };
}
