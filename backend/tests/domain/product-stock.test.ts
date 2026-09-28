import { describe, expect, it } from "vitest";
import { productStatus, stockState } from "../../src/modules/admin/product-stock";

describe("product stock state", () => {
  it("is out of stock only when nothing is sellable", () => {
    expect(stockState(0, 0, 4)).toBe("OUT_OF_STOCK");
  });

  it("is low when a size is at or below its threshold, or sold out while others remain", () => {
    expect(stockState(20, 1, 0)).toBe("LOW_STOCK");
    expect(stockState(20, 0, 1)).toBe("LOW_STOCK");
  });

  it("is in stock when every size is above its threshold", () => {
    expect(stockState(33, 0, 0)).toBe("IN_STOCK");
  });
});

describe("product status", () => {
  it("derives Active, Draft and Archived from visibility and archiving", () => {
    expect(productStatus({ isActive: true, deletedAt: null })).toBe("ACTIVE");
    expect(productStatus({ isActive: false, deletedAt: null })).toBe("DRAFT");
    expect(productStatus({ isActive: false, deletedAt: new Date() })).toBe("ARCHIVED");
    // Archiving wins even if the flag were left on.
    expect(productStatus({ isActive: true, deletedAt: new Date() })).toBe("ARCHIVED");
  });
});
