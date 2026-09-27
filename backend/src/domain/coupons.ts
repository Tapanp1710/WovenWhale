import type { CouponType } from "../contracts/enums";
import { fail, ok, type Result } from "./errors";

/** Everything the coupon engine needs to know about a coupon. */
export interface CouponRule {
  id: string;
  code: string;
  type: CouponType;
  /** PERCENTAGE: whole percent. FIXED_AMOUNT: paise. */
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  newCustomersOnly: boolean;
  firstOrderOnly: boolean;
  isStackable: boolean;
  productIds: string[];
  categoryIds: string[];
}

export interface CouponCustomerContext {
  /** Null for guests — customer-restricted coupons then require sign-in. */
  customerId: string | null;
  accountCreatedAt: Date | null;
  /** Non-cancelled, non-rejected orders placed before this one. */
  priorOrderCount: number;
  /** How many times this customer has redeemed each coupon (by coupon id). */
  usageByCoupon: Record<string, number>;
}

/** A customer counts as "new" for this many days after sign-up. */
export const NEW_CUSTOMER_WINDOW_DAYS = 30;

export const COUPON_ERRORS = {
  NOT_FOUND: "COUPON_NOT_FOUND",
  INACTIVE: "COUPON_INACTIVE",
  NOT_STARTED: "COUPON_NOT_STARTED",
  EXPIRED: "COUPON_EXPIRED",
  USAGE_EXCEEDED: "COUPON_USAGE_EXCEEDED",
  CUSTOMER_LIMIT: "COUPON_CUSTOMER_LIMIT_REACHED",
  MIN_ORDER: "COUPON_MIN_ORDER_NOT_MET",
  NOT_APPLICABLE: "COUPON_NOT_APPLICABLE",
  FIRST_ORDER_ONLY: "COUPON_FIRST_ORDER_ONLY",
  NEW_CUSTOMER_ONLY: "COUPON_NEW_CUSTOMERS_ONLY",
  NOT_STACKABLE: "COUPON_NOT_STACKABLE",
  LOGIN_REQUIRED: "COUPON_LOGIN_REQUIRED",
  DUPLICATE: "COUPON_ALREADY_APPLIED",
  TOO_MANY: "COUPON_LIMIT_PER_ORDER",
} as const;

export const MAX_COUPONS_PER_ORDER = 3;

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validates a coupon's standing rules (dates, limits, customer restrictions,
 * minimum order). Line eligibility is checked by the pricing engine.
 */
export function validateCoupon(coupon: CouponRule, subtotalPaise: number, customer: CouponCustomerContext, now: Date): Result {
  const fmt = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;

  if (!coupon.isActive) return fail(COUPON_ERRORS.INACTIVE, "This coupon is no longer active.");
  if (coupon.startsAt && now < coupon.startsAt) return fail(COUPON_ERRORS.NOT_STARTED, "This coupon is not active yet.");
  if (coupon.endsAt && now > coupon.endsAt) return fail(COUPON_ERRORS.EXPIRED, "This coupon has expired.");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return fail(COUPON_ERRORS.USAGE_EXCEEDED, "This coupon has reached its usage limit.");
  }

  const needsCustomer = coupon.perCustomerLimit !== null || coupon.firstOrderOnly || coupon.newCustomersOnly;
  if (needsCustomer && !customer.customerId) {
    return fail(COUPON_ERRORS.LOGIN_REQUIRED, "Sign in to use this coupon.");
  }
  if (coupon.perCustomerLimit !== null && (customer.usageByCoupon[coupon.id] ?? 0) >= coupon.perCustomerLimit) {
    return fail(COUPON_ERRORS.CUSTOMER_LIMIT, "You have already used this coupon.");
  }
  if (coupon.firstOrderOnly && customer.priorOrderCount > 0) {
    return fail(COUPON_ERRORS.FIRST_ORDER_ONLY, "This coupon is valid on your first order only.");
  }
  if (coupon.newCustomersOnly) {
    const created = customer.accountCreatedAt;
    const windowMs = NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (!created || now.getTime() - created.getTime() > windowMs) {
      return fail(COUPON_ERRORS.NEW_CUSTOMER_ONLY, "This coupon is for new customers only.");
    }
  }
  if (subtotalPaise < coupon.minOrderPaise) {
    return fail(COUPON_ERRORS.MIN_ORDER, `Add items worth ${fmt(coupon.minOrderPaise - subtotalPaise)} more to use this coupon.`);
  }
  return ok(undefined);
}

/** Validates the combination of coupons (stacking rules, duplicates, count). */
export function validateCouponCombination(coupons: Pick<CouponRule, "code" | "isStackable">[]): Result {
  if (coupons.length > MAX_COUPONS_PER_ORDER) {
    return fail(COUPON_ERRORS.TOO_MANY, `At most ${MAX_COUPONS_PER_ORDER} coupons can be combined.`);
  }
  const codes = new Set<string>();
  for (const c of coupons) {
    const code = normalizeCouponCode(c.code);
    if (codes.has(code)) return fail(COUPON_ERRORS.DUPLICATE, "This coupon is already applied.");
    codes.add(code);
  }
  if (coupons.length > 1 && coupons.some((c) => !c.isStackable)) {
    return fail(COUPON_ERRORS.NOT_STACKABLE, "This coupon cannot be combined with other offers.");
  }
  return ok(undefined);
}

/** Line is eligible when the coupon has no restrictions or matches a product/category. */
export function isLineEligible(
  coupon: Pick<CouponRule, "productIds" | "categoryIds">,
  line: { productId: string; categoryIds: string[] },
): boolean {
  if (coupon.productIds.length === 0 && coupon.categoryIds.length === 0) return true;
  if (coupon.productIds.includes(line.productId)) return true;
  return line.categoryIds.some((c) => coupon.categoryIds.includes(c));
}

/** Raw discount for a coupon against an eligible base amount (before allocation). */
export function computeCouponDiscount(coupon: Pick<CouponRule, "type" | "value" | "maxDiscountPaise">, eligiblePaise: number): number {
  if (eligiblePaise <= 0) return 0;
  let discount = coupon.type === "PERCENTAGE" ? Math.floor((eligiblePaise * coupon.value) / 100) : Math.min(coupon.value, eligiblePaise);
  if (coupon.maxDiscountPaise !== null) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(discount, eligiblePaise));
}
