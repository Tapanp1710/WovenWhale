import type { AdminCouponDTO } from "@wovenwhale/backend/contracts";
import { formatINR } from "@/lib/format";

/** "25% off, up to ₹500" / "₹200 off" — value is paise for fixed-amount coupons. */
export function couponValue(c: Pick<AdminCouponDTO, "type" | "value" | "maxDiscountPaise">) {
  if (c.type === "FIXED_AMOUNT") return `${formatINR(c.value)} off`;
  return `${c.value}% off${c.maxDiscountPaise ? `, up to ${formatINR(c.maxDiscountPaise)}` : ""}`;
}

export type CouponState = "active" | "scheduled" | "expired" | "used-up" | "off";

export function couponState(c: AdminCouponDTO, now = Date.now()): CouponState {
  if (!c.isActive) return "off";
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return "used-up";
  if (c.endsAt && Date.parse(c.endsAt) < now) return "expired";
  if (c.startsAt && Date.parse(c.startsAt) > now) return "scheduled";
  return "active";
}
