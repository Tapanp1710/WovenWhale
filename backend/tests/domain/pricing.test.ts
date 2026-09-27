import { describe, expect, it } from "vitest";
import { allocateProportionally, priceCart } from "../../src/domain/pricing";
import { NOW, SHIPPING, coupon, customer, line } from "./fixtures";

const base = { customer: customer(), shipping: SHIPPING, paymentMethod: null, now: NOW } as const;

describe("allocateProportionally", () => {
  it("allocates exactly the full amount", () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
  it("is proportional to weights", () => {
    expect(allocateProportionally(300, [100, 200])).toEqual([100, 200]);
  });
  it("handles zero amounts and weights", () => {
    expect(allocateProportionally(0, [1, 2])).toEqual([0, 0]);
    expect(allocateProportionally(50, [0, 0])).toEqual([0, 0]);
  });
});

describe("priceCart", () => {
  it("computes subtotal, MRP savings and free shipping above the threshold", () => {
    const q = priceCart({ ...base, lines: [line({ quantity: 2 })], coupons: [] });
    expect(q.subtotalPaise).toBe(219800);
    expect(q.mrpTotalPaise).toBe(279800);
    expect(q.productSavingsPaise).toBe(60000);
    expect(q.shippingPaise).toBe(0);
    expect(q.totalPaise).toBe(219800);
    expect(q.itemCount).toBe(2);
  });

  it("charges flat shipping below the threshold", () => {
    const q = priceCart({ ...base, lines: [line({ unitPricePaise: 59900, unitMrpPaise: 79900 })], coupons: [] });
    expect(q.shippingPaise).toBe(9900);
    expect(q.totalPaise).toBe(69800);
  });

  it("evaluates the shipping threshold after coupon discount", () => {
    // ₹1,099 - 10% = ₹989.10 → below the ₹999 free-shipping threshold.
    const q = priceCart({ ...base, lines: [line()], coupons: [coupon()] });
    expect(q.discountPaise).toBe(10990);
    expect(q.shippingPaise).toBe(9900);
    expect(q.totalPaise).toBe(109900 - 10990 + 9900);
  });

  it("adds the COD fee only for COD", () => {
    expect(priceCart({ ...base, lines: [line()], coupons: [], paymentMethod: "COD" }).codFeePaise).toBe(4900);
    expect(priceCart({ ...base, lines: [line()], coupons: [], paymentMethod: "PREPAID" }).codFeePaise).toBe(0);
  });

  it("allocates coupon discounts to lines so line totals reconcile", () => {
    const q = priceCart({
      ...base,
      lines: [line({ lineId: "a", unitPricePaise: 100001 }), line({ lineId: "b", productId: "p-2", unitPricePaise: 50000 })],
      coupons: [coupon({ type: "FIXED_AMOUNT", value: 10001 })],
    });
    const allocated = q.lines.reduce((s, l) => s + l.discountPaise, 0);
    expect(allocated).toBe(q.discountPaise);
    for (const l of q.lines) expect(l.lineTotalPaise).toBe(l.lineSubtotalPaise - l.discountPaise);
  });

  it("applies category-restricted coupons only to eligible lines", () => {
    const q = priceCart({
      ...base,
      lines: [
        line({ lineId: "a", categoryIds: ["ikat"], unitPricePaise: 100000 }),
        line({ lineId: "b", productId: "p-2", categoryIds: ["kurta"], unitPricePaise: 100000 }),
      ],
      coupons: [coupon({ categoryIds: ["ikat"], value: 20 })],
    });
    expect(q.discountPaise).toBe(20000);
    expect(q.lines.find((l) => l.lineId === "b")!.discountPaise).toBe(0);
  });

  it("rejects a coupon that applies to nothing in the bag", () => {
    const q = priceCart({ ...base, lines: [line()], coupons: [coupon({ productIds: ["other"] })] });
    expect(q.discountPaise).toBe(0);
    expect(q.rejectedCoupons[0]?.errorCode).toBe("COUPON_NOT_APPLICABLE");
  });

  it("stacks stackable coupons sequentially and never exceeds the subtotal", () => {
    const q = priceCart({
      ...base,
      lines: [line({ unitPricePaise: 100000 })],
      coupons: [
        coupon({ id: "a", code: "A", isStackable: true, type: "FIXED_AMOUNT", value: 80000 }),
        coupon({ id: "b", code: "B", isStackable: true, type: "FIXED_AMOUNT", value: 80000 }),
      ],
    });
    expect(q.discountPaise).toBe(100000);
    expect(q.lines[0]!.lineTotalPaise).toBe(0);
  });

  it("keeps only the first coupon when a non-stackable one is combined", () => {
    const q = priceCart({
      ...base,
      lines: [line()],
      coupons: [coupon({ id: "a", code: "A" }), coupon({ id: "b", code: "B", isStackable: true })],
    });
    expect(q.appliedCoupons.map((c) => c.code)).toEqual(["A"]);
    expect(q.rejectedCoupons.map((c) => c.code)).toEqual(["B"]);
  });

  it("reports invalid coupons without applying them", () => {
    const q = priceCart({ ...base, lines: [line()], coupons: [coupon({ endsAt: new Date("2020-01-01") })] });
    expect(q.discountPaise).toBe(0);
    expect(q.rejectedCoupons[0]?.errorCode).toBe("COUPON_EXPIRED");
  });

  it("prices an empty cart at zero with no shipping", () => {
    const q = priceCart({ ...base, lines: [], coupons: [], paymentMethod: "COD" });
    expect(q.totalPaise).toBe(0);
  });
});
