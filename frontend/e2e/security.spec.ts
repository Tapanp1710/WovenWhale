import { createHmac } from "node:crypto";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import { BASE_URL, OTP_CODE, customerApi, customerOrder, inStockProduct, placeOrder, uniquePhone } from "./support/fixtures";

// The development gateway's signing secret (MOCK_PAYMENT_WEBHOOK_SECRET in .env); never used in production.
const MOCK_SECRET = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || "dev-mock-gateway-secret";
const sign = (body: string) => createHmac("sha256", MOCK_SECRET).update(body).digest("hex");
const anonymous = () => playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });

test.describe("security boundaries (API)", () => {
  test("payment webhooks: unsigned rejected, wrong amount never confirms, retries are idempotent", async () => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "PREPAID");
    const providerOrderId = String(placed.payment!.clientCheckout.providerOrderId);
    const hook = await anonymous();
    const event = (id: string, amountPaise: number) =>
      JSON.stringify({
        id,
        event: "payment.captured",
        providerOrderId,
        providerPaymentId: `pay_${id}`,
        amountPaise,
        failureReason: null,
      });

    // Unsigned or mis-signed: rejected before anything is parsed.
    const forged = event("evt_forged", placed.totalPaise);
    expect(
      (await hook.post("/api/webhooks/payments/mock", { data: forged, headers: { "Content-Type": "application/json" } })).status(),
    ).toBe(401);
    expect(
      (
        await hook.post("/api/webhooks/payments/mock", {
          data: forged,
          headers: { "Content-Type": "application/json", "x-mock-gateway-signature": sign(forged + " ") },
        })
      ).status(),
    ).toBe(401);
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("PENDING_PAYMENT");

    // Correctly signed but for less money: the order is not confirmed.
    const short = event(`evt_short_${Date.now()}`, placed.totalPaise - 100);
    await hook.post("/api/webhooks/payments/mock", {
      data: short,
      headers: { "Content-Type": "application/json", "x-mock-gateway-signature": sign(short) },
    });
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("PENDING_PAYMENT");

    // The genuine event, delivered twice (gateway retry): processed once.
    const genuine = event(`evt_ok_${Date.now()}`, placed.totalPaise);
    const headers = { "Content-Type": "application/json", "x-mock-gateway-signature": sign(genuine) };
    const first = await (await hook.post("/api/webhooks/payments/mock", { data: genuine, headers })).json();
    const second = await (await hook.post("/api/webhooks/payments/mock", { data: genuine, headers })).json();
    expect(first).toMatchObject({ duplicate: false });
    expect(second).toMatchObject({ duplicate: true });
    const order = await customerOrder(api, placed.orderNumber);
    expect(order.status).toBe("CONFIRMED");
    expect(order.paymentStatus).toBe("PAYMENT_SUCCESS");
    await Promise.all([api.dispose(), hook.dispose()]);
  });

  test("OTP: parallel guesses can't exceed five attempts, and the code is then dead", async () => {
    const phone = uniquePhone();
    const api = await anonymous();
    expect((await api.post("/api/auth/otp/send", { data: { phone } })).ok()).toBe(true);
    const wrong = OTP_CODE === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 10 }, () => api.post("/api/auth/otp/verify", { data: { phone, code: wrong } })));
    const statuses = results.map((r) => r.status());
    expect(statuses.filter((s) => s === 422).length).toBeLessThanOrEqual(5);
    expect(statuses).toContain(429);
    // Even the right code no longer works for this challenge.
    expect((await api.post("/api/auth/otp/verify", { data: { phone, code: OTP_CODE } })).ok()).toBe(false);
    await api.dispose();
  });

  test("webhooks for WhatsApp and shipping reject unsigned requests", async () => {
    const hook = await anonymous();
    const body = JSON.stringify({ entry: [] });
    expect((await hook.post("/api/webhooks/whatsapp", { data: body, headers: { "Content-Type": "application/json" } })).status()).toBe(401);
    expect((await hook.get("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=123")).status()).toBe(403);
    const tracking = JSON.stringify({ events: [{ awb: "AWB1", status: "DELIVERED", occurredAt: new Date().toISOString() }] });
    expect(
      (
        await hook.post("/api/webhooks/shipping/manual", {
          data: tracking,
          headers: { "Content-Type": "application/json", "x-shipping-signature": "00" },
        })
      ).status(),
    ).toBe(401);
    await hook.dispose();
  });

  test("cross-site requests are refused and the client can't set prices or quantities", async () => {
    const { api } = await customerApi();
    const { variant } = await inStockProduct(api);

    const foreign = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: "https://evil.example" } });
    expect((await foreign.post("/api/auth/otp/send", { data: { phone: uniquePhone() } })).status()).toBe(403);

    for (const quantity of [0, -1, 11, 1.5]) {
      expect((await api.post("/api/cart/items", { data: { variantId: variant.id, quantity } })).status()).toBe(400);
    }
    // Extra fields such as a price are ignored; the server's price is used.
    const added = await api.post("/api/cart/items", { data: { variantId: variant.id, quantity: 1, pricePaise: 1, unitPricePaise: 1 } });
    expect(added.ok()).toBe(true);
    const cart = (await (await api.get("/api/cart")).json()) as { lines: { unitPricePaise: number }[] };
    expect(cart.lines[0]!.unitPricePaise).toBe(variant.pricePaise);
    await Promise.all([api.dispose(), foreign.dispose()]);
  });

  test("health check reveals nothing about the environment", async () => {
    const api = await anonymous();
    expect(await (await api.get("/api/health")).json()).toEqual({ status: "ok" });
    await api.dispose();
  });
});
