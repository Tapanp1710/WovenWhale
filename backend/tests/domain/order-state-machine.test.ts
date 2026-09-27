import { describe, expect, it } from "vitest";
import type { Permission } from "../../src/contracts/enums";
import { computeCancelDeadline } from "../../src/domain/deadlines";
import {
  customerCanCancel,
  evaluateOrderTransition,
  initialStatuses,
  isPaymentTransitionAllowed,
  type Actor,
  type OrderSnapshot,
} from "../../src/domain/order-state-machine";
import { NOW } from "./fixtures";

const HOUR = 60 * 60 * 1000;
const admin = (...perms: Permission[]): Actor => ({ type: "ADMIN", id: "a-1", permissions: new Set(perms) });
const customer: Actor = { type: "CUSTOMER", id: "u-1" };
const system: Actor = { type: "SYSTEM", reason: "test" };

function order(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    status: "PENDING_COD_APPROVAL",
    paymentStatus: "PAYMENT_PENDING",
    paymentMethod: "COD",
    cancelDeadlineAt: computeCancelDeadline(NOW, 12),
    ...overrides,
  };
}

describe("initial statuses", () => {
  it("never starts a COD order as CONFIRMED (RULE 2)", () => {
    expect(initialStatuses("COD")).toEqual({ status: "PENDING_COD_APPROVAL", paymentStatus: "PAYMENT_PENDING" });
  });
  it("starts prepaid orders awaiting payment", () => {
    expect(initialStatuses("PREPAID")).toEqual({ status: "PENDING_PAYMENT", paymentStatus: "PAYMENT_INITIATED" });
  });
});

describe("COD approval (RULE 2, RULE 3)", () => {
  it("lets an authorised admin approve", () => {
    expect(evaluateOrderTransition(order(), "CONFIRMED", admin("orders.approve_cod"), NOW).ok).toBe(true);
  });
  it("lets an authorised admin reject", () => {
    expect(evaluateOrderTransition(order(), "REJECTED", admin("orders.approve_cod"), NOW).ok).toBe(true);
  });
  it("blocks admins without the approval permission", () => {
    const r = evaluateOrderTransition(order(), "CONFIRMED", admin("orders.manage"), NOW);
    expect(!r.ok && r.code).toBe("FORBIDDEN");
  });
  it("never lets the system or customer confirm a COD order", () => {
    expect(evaluateOrderTransition(order(), "CONFIRMED", system, NOW).ok).toBe(false);
    expect(evaluateOrderTransition(order(), "CONFIRMED", customer, NOW).ok).toBe(false);
  });
  it("cannot reject an order that is already confirmed", () => {
    expect(evaluateOrderTransition(order({ status: "CONFIRMED" }), "REJECTED", admin("orders.approve_cod"), NOW).ok).toBe(false);
  });
});

describe("prepaid confirmation (RULE 1, RULE 10)", () => {
  const prepaid = (paymentStatus: OrderSnapshot["paymentStatus"]) =>
    order({ status: "PENDING_PAYMENT", paymentMethod: "PREPAID", paymentStatus });

  it("confirms automatically once payment is verified", () => {
    expect(evaluateOrderTransition(prepaid("PAYMENT_SUCCESS"), "CONFIRMED", system, NOW).ok).toBe(true);
  });
  it("refuses confirmation without verified payment", () => {
    const r = evaluateOrderTransition(prepaid("PAYMENT_PENDING"), "CONFIRMED", system, NOW);
    expect(!r.ok && r.code).toBe("PAYMENT_NOT_VERIFIED");
  });
  it("does not let an admin bypass payment verification", () => {
    expect(evaluateOrderTransition(prepaid("PAYMENT_PENDING"), "CONFIRMED", admin(...allPerms()), NOW).ok).toBe(false);
  });
});

describe("customer cancellation window (RULE 5)", () => {
  it("allows cancellation within 12 hours", () => {
    expect(customerCanCancel(order(), new Date(NOW.getTime() + 11 * HOUR))).toBe(true);
    expect(customerCanCancel(order(), new Date(NOW.getTime() + 12 * HOUR))).toBe(true);
  });
  it("blocks cancellation after 12 hours", () => {
    const r = evaluateOrderTransition(order(), "CANCELLED", customer, new Date(NOW.getTime() + 12 * HOUR + 1));
    expect(!r.ok && r.code).toBe("CANCEL_WINDOW_EXPIRED");
  });
  it("blocks cancellation once packed, even inside the window", () => {
    const r = evaluateOrderTransition(order({ status: "PACKED" }), "CANCELLED", customer, NOW);
    expect(!r.ok && r.code).toBe("CANCEL_NOT_ALLOWED");
  });
  it("lets admins with override permission cancel after the window", () => {
    const later = new Date(NOW.getTime() + 48 * HOUR);
    expect(evaluateOrderTransition(order({ status: "PACKED" }), "CANCELLED", admin("orders.cancel_override"), later).ok).toBe(true);
    expect(evaluateOrderTransition(order({ status: "PACKED" }), "CANCELLED", admin("orders.manage"), later).ok).toBe(false);
  });
  it("lets the system cancel only unpaid prepaid orders", () => {
    expect(evaluateOrderTransition(order({ status: "PENDING_PAYMENT", paymentMethod: "PREPAID" }), "CANCELLED", system, NOW).ok).toBe(true);
    expect(evaluateOrderTransition(order({ status: "CONFIRMED" }), "CANCELLED", system, NOW).ok).toBe(false);
  });
  it("never cancels shipped or delivered orders", () => {
    expect(evaluateOrderTransition(order({ status: "SHIPPED" }), "CANCELLED", admin("orders.cancel_override"), NOW).ok).toBe(false);
    expect(evaluateOrderTransition(order({ status: "DELIVERED" }), "CANCELLED", admin("orders.cancel_override"), NOW).ok).toBe(false);
  });
});

describe("fulfilment transitions", () => {
  it("walks the happy path with orders.manage", () => {
    const steps = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
    for (let i = 0; i < steps.length - 1; i++) {
      expect(evaluateOrderTransition(order({ status: steps[i] }), steps[i + 1]!, admin("orders.manage"), NOW).ok).toBe(true);
    }
  });
  it("rejects skipping steps", () => {
    expect(evaluateOrderTransition(order({ status: "CONFIRMED" }), "SHIPPED", admin("orders.manage"), NOW).ok).toBe(false);
  });
  it("forbids customers from changing fulfilment", () => {
    expect(evaluateOrderTransition(order({ status: "CONFIRMED" }), "PROCESSING", customer, NOW).ok).toBe(false);
  });
});

describe("payment state machine (RULE 4 — separate from order status)", () => {
  it("allows success after failure (late gateway capture) and refunds after success", () => {
    expect(isPaymentTransitionAllowed("PAYMENT_FAILED", "PAYMENT_SUCCESS")).toBe(true);
    expect(isPaymentTransitionAllowed("PAYMENT_SUCCESS", "PAYMENT_REFUNDED")).toBe(true);
  });
  it("forbids refunding an unpaid payment", () => {
    expect(isPaymentTransitionAllowed("PAYMENT_PENDING", "PAYMENT_REFUNDED")).toBe(false);
    expect(isPaymentTransitionAllowed("PAYMENT_REFUNDED", "PAYMENT_SUCCESS")).toBe(false);
  });
});

function allPerms(): Permission[] {
  return ["orders.manage", "orders.approve_cod", "orders.cancel_override"];
}
