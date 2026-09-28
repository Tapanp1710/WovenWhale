import { describe, expect, it } from "vitest";
import { computeReturnDeadline } from "../../src/domain/deadlines";
import { available, planMovement } from "../../src/domain/inventory";
import { capRefund, evaluateReturnEligibility, evaluateReturnTransition, refundForLine } from "../../src/domain/returns";
import { NOW } from "./fixtures";

const DAY = 24 * 60 * 60 * 1000;

describe("return eligibility (RULE 6)", () => {
  const delivered = { status: "DELIVERED" as const, returnDeadlineAt: computeReturnDeadline(NOW, 14) };

  it("allows requests within 14 days of delivery", () => {
    expect(evaluateReturnEligibility(delivered, new Date(NOW.getTime() + 13 * DAY)).ok).toBe(true);
    expect(evaluateReturnEligibility(delivered, new Date(NOW.getTime() + 14 * DAY)).ok).toBe(true);
  });
  it("blocks requests after 14 days", () => {
    const r = evaluateReturnEligibility(delivered, new Date(NOW.getTime() + 14 * DAY + 1));
    expect(!r.ok && r.code).toBe("RETURN_WINDOW_EXPIRED");
  });
  it("blocks requests before delivery", () => {
    const r = evaluateReturnEligibility({ status: "SHIPPED", returnDeadlineAt: null }, NOW);
    expect(!r.ok && r.code).toBe("RETURN_NOT_AVAILABLE");
  });
});

describe("return state machine", () => {
  it("runs the RETURN path: approve → receive → refund → complete", () => {
    const t = (status: Parameters<typeof evaluateReturnTransition>[0]["status"], to: Parameters<typeof evaluateReturnTransition>[1]) =>
      evaluateReturnTransition({ status, type: "RETURN" }, to, "ADMIN").ok;
    expect(t("REQUESTED", "APPROVED")).toBe(true);
    expect(t("APPROVED", "RECEIVED")).toBe(true);
    expect(t("RECEIVED", "REFUND_INITIATED")).toBe(true);
    expect(t("REFUND_INITIATED", "COMPLETED")).toBe(true);
  });
  it("requires the item to be received before refunding a RETURN", () => {
    const r = evaluateReturnTransition({ status: "APPROVED", type: "RETURN" }, "REFUND_INITIATED", "ADMIN");
    expect(!r.ok && r.code).toBe("ITEM_NOT_RECEIVED");
  });
  it("lets REFUND-only requests skip receipt", () => {
    expect(evaluateReturnTransition({ status: "APPROVED", type: "REFUND" }, "REFUND_INITIATED", "ADMIN").ok).toBe(true);
  });
  it("completes exchanges without a refund", () => {
    expect(evaluateReturnTransition({ status: "RECEIVED", type: "EXCHANGE" }, "COMPLETED", "ADMIN").ok).toBe(true);
    expect(evaluateReturnTransition({ status: "RECEIVED", type: "EXCHANGE" }, "REFUND_INITIATED", "ADMIN").ok).toBe(false);
  });
  it("restricts customers to withdrawing or replying", () => {
    expect(evaluateReturnTransition({ status: "REQUESTED", type: "RETURN" }, "CANCELLED", "CUSTOMER").ok).toBe(true);
    expect(evaluateReturnTransition({ status: "INFO_REQUESTED", type: "RETURN" }, "REQUESTED", "CUSTOMER").ok).toBe(true);
    expect(evaluateReturnTransition({ status: "REQUESTED", type: "RETURN" }, "APPROVED", "CUSTOMER").ok).toBe(false);
  });
});

describe("refund calculations", () => {
  const lineItem = { orderItemId: "oi-1", quantity: 3, lineTotalPaise: 100000 }; // 333.33 per unit

  it("refunds what was paid per unit", () => {
    expect(refundForLine(lineItem, 1, 0)).toBe(33333);
  });
  it("lets the final unit absorb rounding so a full return refunds the full line", () => {
    const first = refundForLine(lineItem, 2, 0);
    const last = refundForLine(lineItem, 1, 2);
    expect(first + last).toBe(100000);
    expect(refundForLine(lineItem, 3, 0)).toBe(100000);
  });
  it("never refunds more than was paid", () => {
    expect(capRefund(50000, 100000, 70000)).toBe(30000);
    expect(capRefund(50000, 100000, 100000)).toBe(0);
  });
});

describe("inventory movements (RULE 8)", () => {
  const level = { onHand: 10, reserved: 3 };

  it("reserves against available stock only", () => {
    expect(planMovement(level, { kind: "RESERVE", quantity: 7 }).ok).toBe(true);
    const r = planMovement(level, { kind: "RESERVE", quantity: 8 });
    expect(!r.ok && r.code).toBe("INSUFFICIENT_STOCK");
  });
  it("commits a reservation by deducting on-hand", () => {
    const r = planMovement(level, { kind: "COMMIT", quantity: 3 });
    expect(r.ok && r.value.after).toEqual({ onHand: 7, reserved: 0 });
    expect(r.ok && r.value.type).toBe("ORDER_CONFIRMED");
  });
  it("releases reservations on pre-confirmation cancellation", () => {
    const r = planMovement(level, { kind: "RELEASE", quantity: 3 });
    expect(r.ok && r.value.after).toEqual({ onHand: 10, reserved: 0 });
    expect(r.ok && r.value.type).toBe("ORDER_CANCELLED");
  });
  it("restocks returns", () => {
    const r = planMovement(level, { kind: "RETURN_RECEIVED", quantity: 2 });
    expect(r.ok && r.value.after.onHand).toBe(12);
  });
  it("refuses adjustments that would make stock negative", () => {
    const r = planMovement(level, { kind: "ADJUST", delta: -(level.onHand + 1), type: "MANUAL_ADJUSTMENT" });
    expect(!r.ok && [r.code, r.message]).toEqual(["INSUFFICIENT_STOCK", "Insufficient stock."]);
  });
  it("refuses manual adjustments below reserved units", () => {
    const r = planMovement(level, { kind: "ADJUST", delta: -8, type: "MANUAL_ADJUSTMENT" });
    expect(!r.ok && r.code).toBe("BELOW_RESERVED");
  });
  it("rejects non-positive quantities", () => {
    expect(planMovement(level, { kind: "RESERVE", quantity: 0 }).ok).toBe(false);
    expect(planMovement(level, { kind: "STOCK_IN", quantity: -1 }).ok).toBe(false);
  });
  it("computes availability", () => {
    expect(available(level)).toBe(7);
  });
});
