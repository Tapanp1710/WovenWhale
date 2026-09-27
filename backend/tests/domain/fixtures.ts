import type { CouponCustomerContext, CouponRule } from "../../src/domain/coupons";
import type { PricingLineInput, ShippingRules } from "../../src/domain/pricing";

export const NOW = new Date("2026-09-27T10:00:00.000Z");

export function coupon(overrides: Partial<CouponRule> = {}): CouponRule {
  return {
    id: overrides.code ?? "c-1",
    code: "WELCOME10",
    type: "PERCENTAGE",
    value: 10,
    minOrderPaise: 0,
    maxDiscountPaise: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usedCount: 0,
    perCustomerLimit: null,
    isActive: true,
    newCustomersOnly: false,
    firstOrderOnly: false,
    isStackable: false,
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

export function customer(overrides: Partial<CouponCustomerContext> = {}): CouponCustomerContext {
  return {
    customerId: "u-1",
    accountCreatedAt: new Date("2026-09-20T00:00:00.000Z"),
    priorOrderCount: 0,
    usageByCoupon: {},
    ...overrides,
  };
}

export function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    lineId: "l-1",
    productId: "p-1",
    categoryIds: ["cat-ikat"],
    quantity: 1,
    unitPricePaise: 109900,
    unitMrpPaise: 139900,
    ...overrides,
  };
}

export const SHIPPING: ShippingRules = {
  freeShippingThresholdPaise: 99900,
  flatShippingPaise: 9900,
  codFeePaise: 4900,
};
