import type { PaymentMethod } from "../contracts/enums";
import {
  computeCouponDiscount,
  isLineEligible,
  validateCoupon,
  validateCouponCombination,
  type CouponCustomerContext,
  type CouponRule,
} from "./coupons";

export interface PricingLineInput {
  lineId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPricePaise: number;
  unitMrpPaise: number;
}

export interface ShippingRules {
  /** Orders at or above this (after discount) ship free. */
  freeShippingThresholdPaise: number;
  flatShippingPaise: number;
  codFeePaise: number;
}

export interface PricedLine extends PricingLineInput {
  lineSubtotalPaise: number;
  lineMrpPaise: number;
  discountPaise: number;
  lineTotalPaise: number;
}

export interface AppliedCoupon {
  couponId: string;
  code: string;
  discountPaise: number;
}

export interface RejectedCoupon {
  code: string;
  errorCode: string;
  message: string;
}

export interface PriceQuote {
  lines: PricedLine[];
  mrpTotalPaise: number;
  subtotalPaise: number;
  /** Savings from MRP to selling price (informational). */
  productSavingsPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  totalPaise: number;
  appliedCoupons: AppliedCoupon[];
  rejectedCoupons: RejectedCoupon[];
  itemCount: number;
}

/**
 * Splits `amount` across weights proportionally so the parts sum exactly to
 * `amount` (largest-remainder method). Used to allocate order-level discounts
 * to lines so partial refunds are exact.
 */
export function allocateProportionally(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const parts = raw.map(Math.floor);
  let remainder = amount - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i]! += 1;
    remainder -= 1;
  }
  return parts;
}

/**
 * The single authoritative price calculation for carts, checkout and order
 * creation. Always runs server-side from catalog prices — never from values
 * supplied by the client.
 */
export function priceCart(input: {
  lines: PricingLineInput[];
  coupons: CouponRule[];
  customer: CouponCustomerContext;
  shipping: ShippingRules;
  paymentMethod: PaymentMethod | null;
  now: Date;
}): PriceQuote {
  const lines: PricedLine[] = input.lines.map((l) => ({
    ...l,
    lineSubtotalPaise: l.unitPricePaise * l.quantity,
    lineMrpPaise: l.unitMrpPaise * l.quantity,
    discountPaise: 0,
    lineTotalPaise: l.unitPricePaise * l.quantity,
  }));
  const subtotalPaise = lines.reduce((s, l) => s + l.lineSubtotalPaise, 0);
  const mrpTotalPaise = lines.reduce((s, l) => s + l.lineMrpPaise, 0);

  const appliedCoupons: AppliedCoupon[] = [];
  const rejectedCoupons: RejectedCoupon[] = [];

  // Stacking rules apply to the whole set; if the set is invalid, keep only the first coupon.
  let candidates = input.coupons;
  const combination = validateCouponCombination(candidates);
  if (!combination.ok) {
    const [first, ...rest] = candidates;
    candidates = first ? [first] : [];
    for (const c of rest) rejectedCoupons.push({ code: c.code, errorCode: combination.code, message: combination.message });
  }

  for (const coupon of candidates) {
    const valid = validateCoupon(coupon, subtotalPaise, input.customer, input.now);
    if (!valid.ok) {
      rejectedCoupons.push({ code: coupon.code, errorCode: valid.code, message: valid.message });
      continue;
    }
    const eligible = lines.filter((l) => isLineEligible(coupon, l));
    const eligibleBase = eligible.reduce((s, l) => s + l.lineTotalPaise, 0);
    const discount = computeCouponDiscount(coupon, eligibleBase);
    if (discount <= 0) {
      rejectedCoupons.push({
        code: coupon.code,
        errorCode: "COUPON_NOT_APPLICABLE",
        message: "This coupon does not apply to the items in your bag.",
      });
      continue;
    }
    const shares = allocateProportionally(
      discount,
      eligible.map((l) => l.lineTotalPaise),
    );
    eligible.forEach((line, i) => {
      line.discountPaise += shares[i]!;
      line.lineTotalPaise = line.lineSubtotalPaise - line.discountPaise;
    });
    appliedCoupons.push({ couponId: coupon.id, code: coupon.code, discountPaise: discount });
  }

  const discountPaise = appliedCoupons.reduce((s, c) => s + c.discountPaise, 0);
  const afterDiscount = subtotalPaise - discountPaise;
  const shippingPaise =
    lines.length === 0 || afterDiscount >= input.shipping.freeShippingThresholdPaise ? 0 : input.shipping.flatShippingPaise;
  const codFeePaise = input.paymentMethod === "COD" && lines.length > 0 ? input.shipping.codFeePaise : 0;

  return {
    lines,
    mrpTotalPaise,
    subtotalPaise,
    productSavingsPaise: mrpTotalPaise - subtotalPaise,
    discountPaise,
    shippingPaise,
    codFeePaise,
    totalPaise: afterDiscount + shippingPaise + codFeePaise,
    appliedCoupons,
    rejectedCoupons,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}
