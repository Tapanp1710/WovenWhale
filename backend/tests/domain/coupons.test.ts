import { describe, expect, it } from "vitest";
import {
  COUPON_ERRORS,
  computeCouponDiscount,
  isLineEligible,
  normalizeCouponCode,
  validateCoupon,
  validateCouponCombination,
} from "../../src/domain/coupons";
import { NOW, coupon, customer } from "./fixtures";

const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe("validateCoupon", () => {
  it("accepts a valid coupon", () => {
    expect(validateCoupon(coupon(), 100000, customer(), NOW).ok).toBe(true);
  });

  it.each([
    ["inactive", coupon({ isActive: false }), COUPON_ERRORS.INACTIVE],
    ["not started", coupon({ startsAt: new Date(NOW.getTime() + 1000) }), COUPON_ERRORS.NOT_STARTED],
    ["expired", coupon({ endsAt: new Date(NOW.getTime() - 1000) }), COUPON_ERRORS.EXPIRED],
    ["exhausted", coupon({ usageLimit: 5, usedCount: 5 }), COUPON_ERRORS.USAGE_EXCEEDED],
    ["below minimum", coupon({ minOrderPaise: 200000 }), COUPON_ERRORS.MIN_ORDER],
  ])("rejects %s coupons", (_label, c, code) => {
    const r = validateCoupon(c, 100000, customer(), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });

  it("enforces the per-customer limit", () => {
    const c = coupon({ id: "c-9", perCustomerLimit: 1 });
    const r = validateCoupon(c, 100000, customer({ usageByCoupon: { "c-9": 1 } }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(COUPON_ERRORS.CUSTOMER_LIMIT);
  });

  it("requires sign-in for customer-restricted coupons", () => {
    const r = validateCoupon(coupon({ firstOrderOnly: true }), 100000, customer({ customerId: null }), NOW);
    expect(!r.ok && r.code).toBe(COUPON_ERRORS.LOGIN_REQUIRED);
  });

  it("restricts first-order coupons to customers without prior orders", () => {
    const c = coupon({ firstOrderOnly: true });
    expect(validateCoupon(c, 100000, customer({ priorOrderCount: 0 }), NOW).ok).toBe(true);
    const r = validateCoupon(c, 100000, customer({ priorOrderCount: 2 }), NOW);
    expect(!r.ok && r.code).toBe(COUPON_ERRORS.FIRST_ORDER_ONLY);
  });

  it("restricts new-customer coupons to accounts younger than 30 days", () => {
    const c = coupon({ newCustomersOnly: true });
    expect(validateCoupon(c, 100000, customer({ accountCreatedAt: new Date(NOW.getTime() - days(29)) }), NOW).ok).toBe(true);
    const r = validateCoupon(c, 100000, customer({ accountCreatedAt: new Date(NOW.getTime() - days(31)) }), NOW);
    expect(!r.ok && r.code).toBe(COUPON_ERRORS.NEW_CUSTOMER_ONLY);
  });
});

describe("validateCouponCombination", () => {
  it("allows a single non-stackable coupon", () => {
    expect(validateCouponCombination([coupon()]).ok).toBe(true);
  });
  it("allows multiple stackable coupons", () => {
    expect(validateCouponCombination([coupon({ code: "A", isStackable: true }), coupon({ code: "B", isStackable: true })]).ok).toBe(true);
  });
  it("rejects combining a non-stackable coupon", () => {
    const r = validateCouponCombination([coupon({ code: "A", isStackable: true }), coupon({ code: "B" })]);
    expect(!r.ok && r.code).toBe(COUPON_ERRORS.NOT_STACKABLE);
  });
  it("rejects duplicate codes regardless of case", () => {
    const r = validateCouponCombination([coupon({ code: "save", isStackable: true }), coupon({ code: "SAVE", isStackable: true })]);
    expect(!r.ok && r.code).toBe(COUPON_ERRORS.DUPLICATE);
  });
});

describe("computeCouponDiscount", () => {
  it("floors percentage discounts to whole paise", () => {
    expect(computeCouponDiscount({ type: "PERCENTAGE", value: 15, maxDiscountPaise: null }, 109999)).toBe(16499);
  });
  it("caps percentage discounts at the maximum", () => {
    expect(computeCouponDiscount({ type: "PERCENTAGE", value: 50, maxDiscountPaise: 30000 }, 200000)).toBe(30000);
  });
  it("never discounts more than the eligible amount", () => {
    expect(computeCouponDiscount({ type: "FIXED_AMOUNT", value: 500000, maxDiscountPaise: null }, 109900)).toBe(109900);
  });
  it("returns zero for no eligible amount", () => {
    expect(computeCouponDiscount({ type: "FIXED_AMOUNT", value: 10000, maxDiscountPaise: null }, 0)).toBe(0);
  });
});

describe("isLineEligible / normalizeCouponCode", () => {
  it("matches unrestricted, product and category scopes", () => {
    const l = { productId: "p-1", categoryIds: ["ikat"] };
    expect(isLineEligible({ productIds: [], categoryIds: [] }, l)).toBe(true);
    expect(isLineEligible({ productIds: ["p-1"], categoryIds: [] }, l)).toBe(true);
    expect(isLineEligible({ productIds: [], categoryIds: ["ikat"] }, l)).toBe(true);
    expect(isLineEligible({ productIds: ["p-2"], categoryIds: ["kurta"] }, l)).toBe(false);
  });
  it("normalises codes", () => {
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
  });
});
