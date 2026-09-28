import { describe, expect, it } from "vitest";
import { addressInputSchema, placeOrderSchema, productListQuerySchema, profileUpdateSchema } from "../../src/contracts/storefront";
import { phoneSchema } from "../../src/contracts/validation";

const address = {
  fullName: "Meera Iyer",
  phone: "98123 45678",
  line1: "Flat 12B, Palm Grove",
  line2: "4th Cross Road",
  area: "Koramangala",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560034",
};

describe("phone normalisation", () => {
  it.each(["9812345678", "98123 45678", "+91 98123-45678", "09812345678", "+919812345678"])("normalises %s to E.164", (input) => {
    expect(phoneSchema.parse(input)).toBe("+919812345678");
  });
  it.each(["12345", "5812345678", "98123456789"])("rejects %s", (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

describe("address schema", () => {
  it("normalises blank optional fields to null", () => {
    const out = addressInputSchema.parse({ ...address, landmark: "", email: "" });
    expect(out.landmark).toBeNull();
    // Regression: whitespace collapsing once stripped every letter "s".
    expect(addressInputSchema.parse({ ...address, landmark: "  Near bus\u0007 stops  " }).landmark).toBe("Near bus stops");
    expect(out.email).toBeNull();
  });

  it("accepts its own output (client-validated payloads re-validate on the server)", () => {
    const out = addressInputSchema.parse({ ...address, landmark: "", email: "" });
    expect(addressInputSchema.safeParse(out).success).toBe(true);
  });

  it("rejects invalid pincode, state and email", () => {
    expect(addressInputSchema.safeParse({ ...address, pincode: "012345" }).success).toBe(false);
    expect(addressInputSchema.safeParse({ ...address, state: "Atlantis" }).success).toBe(false);
    expect(addressInputSchema.safeParse({ ...address, email: "not-an-email" }).success).toBe(false);
  });

  it("strips control characters from free text", () => {
    expect(addressInputSchema.parse({ ...address, area: "Kora\u0000mangala  " }).area).toBe("Kora mangala");
  });
});

describe("profile schema", () => {
  it("leaves an omitted email untouched", () => {
    expect(profileUpdateSchema.parse({ fullName: "Meera" })).not.toHaveProperty("email");
  });
});

describe("catalog query", () => {
  it("parses comma-separated multi filters and defaults the sort", () => {
    const q = productListQuerySchema.parse({ size: "L,XL", color: "Blue" });
    expect(q.size).toEqual(["L", "XL"]);
    expect(q.color).toEqual(["Blue"]);
    expect(q.sort).toBe("featured");
  });
  it("rejects unknown sorts", () => {
    expect(productListQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
  });
});

describe("place order", () => {
  it("requires an idempotency key and a non-negative expected total", () => {
    const base = { addressId: "7c599f86-b0e2-40eb-a9fa-33f2beec94da", paymentMethod: "COD" };
    expect(placeOrderSchema.safeParse({ ...base, idempotencyKey: "short", expectedTotalPaise: 100 }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...base, idempotencyKey: "a".repeat(20), expectedTotalPaise: -1 }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...base, idempotencyKey: "a".repeat(20), expectedTotalPaise: 109900 }).success).toBe(true);
  });
});

describe("admin shipment schema", () => {
  it("accepts a missing, empty or null tracking link and its own output", async () => {
    const { shipmentCreateSchema } = await import("../../src/contracts/admin");
    for (const trackingUrl of [undefined, "", null, "https://track.example/awb"]) {
      const out = shipmentCreateSchema.parse({ courierName: "Delhivery", awb: "dlv1234", trackingUrl });
      expect(shipmentCreateSchema.safeParse(out).success).toBe(true);
    }
    expect(shipmentCreateSchema.safeParse({ courierName: "Delhivery", awb: "dlv1234", trackingUrl: "nope" }).success).toBe(false);
  });
});
