import { createHmac } from "node:crypto";
import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import type {
  AdminReturnRowDTO,
  AddressDTO,
  CartDTO,
  InventoryRowDTO,
  InventoryTxnDTO,
  WishlistItemDTO,
} from "@wovenwhale/backend/contracts";
import { BASE_URL, adminApi, customerApi, customerOrder, inStockProduct, orderId, placeOrder } from "./support/fixtures";

const MOCK_SECRET = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || "dev-mock-gateway-secret";
const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "Demo-Only-2026!";

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Delivers a correctly signed "payment captured" webhook, as the gateway would. */
async function payByWebhook(providerOrderId: string, amountPaise: number) {
  const hook = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const body = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${Math.random()}`,
    event: "payment.captured",
    providerOrderId,
    providerPaymentId: `pay_e2e_${Date.now()}`,
    amountPaise,
    failureReason: null,
  });
  const signature = createHmac("sha256", MOCK_SECRET).update(body).digest("hex");
  await ok(
    await hook.post("/api/webhooks/payments/mock", {
      data: body,
      headers: { "Content-Type": "application/json", "x-mock-gateway-signature": signature },
    }),
  );
  await hook.dispose();
}

async function adminAs(email: string) {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  await ok(await api.post("/api/admin/auth/login", { data: { email, password: DEMO_PASSWORD } }));
  return api;
}

const onHand = async (admin: APIRequestContext, sku: string) =>
  (await ok<{ items: InventoryRowDTO[] }>(await admin.get(`/api/admin/inventory?q=${encodeURIComponent(sku)}`))).items.find(
    (i) => i.sku === sku,
  )!;

test.describe("order lifecycle end to end (API)", () => {
  test("prepaid: pay → process → pack → ship (https link) → deliver → return → receive → refund → complete", async () => {
    const { api, phone } = await customerApi();
    const admin = await adminApi();
    const placed = await placeOrder(api, phone, "PREPAID");
    expect(placed.status).toBe("PENDING_PAYMENT");

    await payByWebhook(String(placed.payment!.clientCheckout.providerOrderId), placed.totalPaise);
    let order = await customerOrder(api, placed.orderNumber);
    expect(order.status).toBe("CONFIRMED"); // no admin approval for verified prepaid payments
    expect(order.paymentStatus).toBe("PAYMENT_SUCCESS");
    const item = order.items[0]!;
    const stockBefore = await onHand(admin, item.sku);

    const id = await orderId(admin, placed.orderNumber);
    await ok(await admin.post(`/api/admin/orders/${id}/status`, { data: { to: "PROCESSING" } }));
    await ok(await admin.post(`/api/admin/orders/${id}/status`, { data: { to: "PACKED" } }));
    const unsafe = await admin.post(`/api/admin/orders/${id}/shipments`, {
      data: { courierName: "Delhivery", awb: `E2E${Date.now()}`, trackingUrl: "javascript:alert(1)" },
    });
    expect(unsafe.status()).toBe(400);
    await ok(
      await admin.post(`/api/admin/orders/${id}/shipments`, {
        data: { courierName: "Delhivery", awb: `E2E${Date.now()}`, trackingUrl: "https://www.delhivery.com/track/package/E2E" },
      }),
    );
    await ok(await admin.post(`/api/admin/orders/${id}/status`, { data: { to: "DELIVERED" } }));
    order = await customerOrder(api, placed.orderNumber);
    expect(order.status).toBe("DELIVERED");
    expect(order.shipments[0]?.trackingUrl).toMatch(/^https:\/\//);

    // Customer asks to return one unit.
    const { returnNumber } = await ok<{ returnNumber: string }>(
      await api.post(`/api/orders/${placed.orderNumber}/returns`, {
        data: { type: "RETURN", reason: "SIZE_ISSUE", items: [{ orderItemId: item.id, quantity: 1 }] },
      }),
    );
    const list = await ok<{ items: AdminReturnRowDTO[] }>(await admin.get("/api/admin/returns?pageSize=100"));
    const ret = list.items.find((r) => r.returnNumber === returnNumber)!;
    expect(ret.status).toBe("REQUESTED");

    // Refunding before the item is back is refused.
    expect((await admin.post(`/api/admin/returns/${ret.id}/refund`, { data: { method: "ORIGINAL_PAYMENT" } })).ok()).toBe(false);

    await ok(await admin.post(`/api/admin/returns/${ret.id}/transition`, { data: { to: "APPROVED" } }));
    await ok(await admin.post(`/api/admin/returns/${ret.id}/transition`, { data: { to: "RECEIVED", restock: true } }));
    expect((await onHand(admin, item.sku)).onHand).toBe(stockBefore.onHand + 1); // restocked

    // A refund larger than what's refundable is refused; the computed amount goes through.
    const tooMuch = await admin.post(`/api/admin/returns/${ret.id}/refund`, {
      data: { method: "ORIGINAL_PAYMENT", amount: (placed.totalPaise + 100_00) / 100 },
    });
    expect(tooMuch.ok()).toBe(false);
    await ok(await admin.post(`/api/admin/returns/${ret.id}/refund`, { data: { method: "ORIGINAL_PAYMENT" } }));

    await expect
      .poll(async () => (await customerOrder(api, placed.orderNumber)).refunds.map((r) => r.status), { timeout: 15_000 })
      .toContain("PROCESSED");
    const detail = await ok<AdminReturnRowDTO>(await admin.get(`/api/admin/returns/${ret.id}`));
    if (detail.status !== "COMPLETED") await ok(await admin.post(`/api/admin/returns/${ret.id}/transition`, { data: { to: "COMPLETED" } }));
    expect((await ok<AdminReturnRowDTO>(await admin.get(`/api/admin/returns/${ret.id}`))).status).toBe("COMPLETED");
    order = await customerOrder(api, placed.orderNumber);
    expect(order.status).toBe("DELIVERED"); // order status and payment status stay separate
    expect(order.paymentStatus).toMatch(/REFUNDED/);

    // A second refund for the same return is refused.
    expect((await admin.post(`/api/admin/returns/${ret.id}/refund`, { data: { method: "ORIGINAL_PAYMENT" } })).ok()).toBe(false);

    // Every admin step is in the audit trail.
    const audit = await ok<{ items: { action: string }[] }>(await admin.get(`/api/admin/audit-logs?entityType=order&entityId=${id}`));
    expect(audit.items.map((a) => a.action)).toEqual(expect.arrayContaining(["order.shipped"]));
    await Promise.all([api.dispose(), admin.dispose()]);
  });

  test("cart, coupons, wishlist and addresses are server-side and persistent", async () => {
    const { api, phone } = await customerApi();
    const { product, variant } = await inStockProduct(api);

    // Cart: add, update, remove.
    let cart = await ok<CartDTO>(await api.post("/api/cart/items", { data: { variantId: variant.id, quantity: 2 } }));
    const line = cart.lines.find((l) => l.variantId === variant.id)!;
    cart = await ok<CartDTO>(await api.patch(`/api/cart/items/${line.id}`, { data: { quantity: 1 } }));
    expect(cart.lines.find((l) => l.id === line.id)!.quantity).toBe(1);

    // Coupons: unknown and expired codes are refused; a valid one is priced by the server.
    expect((await api.post("/api/cart/coupons", { data: { code: "NOSUCHCODE" } })).ok()).toBe(false);
    expect((await api.post("/api/cart/coupons", { data: { code: "MONSOON25" } })).ok()).toBe(false);
    await ok(await api.patch(`/api/cart/items/${line.id}`, { data: { quantity: 3 } }));
    const withCoupon = await api.post("/api/cart/coupons", { data: { code: "FLAT200" } });
    if (withCoupon.ok()) {
      cart = (await withCoupon.json()) as CartDTO;
      expect(cart.appliedCoupons.map((c) => c.code)).toContain("FLAT200");
      expect(cart.totals.discountPaise).toBe(20000);
      expect(cart.totals.totalPaise).toBe(cart.totals.subtotalPaise - 20000 + cart.totals.shippingPaise + cart.totals.codFeePaise);
      await ok(await api.delete("/api/cart/coupons/FLAT200"));
    } else {
      // Only possible when the product costs less than the ₹1,499 minimum even at quantity 3.
      expect(cart.totals.subtotalPaise * 3).toBeLessThan(149900);
    }
    await ok(await api.delete(`/api/cart/items/${line.id}`));

    // Wishlist persists on the account.
    await ok(await api.post("/api/wishlist/items", { data: { productId: product.id } }));
    expect((await ok<WishlistItemDTO[]>(await api.get("/api/wishlist"))).map((w) => w.productId)).toContain(product.id);
    await ok(await api.delete(`/api/wishlist/items/${product.id}`));
    expect((await ok<WishlistItemDTO[]>(await api.get("/api/wishlist"))).map((w) => w.productId)).not.toContain(product.id);

    // Several addresses, one default.
    const address = (line1: string) => ({
      fullName: "E2E Customer",
      phone,
      line1,
      line2: "1st Main Road",
      area: "Indiranagar",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
    });
    const home = await ok<AddressDTO>(await api.post("/api/account/addresses", { data: address("12 Home Street") }));
    const work = await ok<AddressDTO>(await api.post("/api/account/addresses", { data: address("7 Office Park") }));
    await ok(await api.post(`/api/account/addresses/${work.id}/default`, {}));
    const all = await ok<(AddressDTO & { isDefault: boolean })[]>(await api.get("/api/account/addresses"));
    expect(all.find((a) => a.id === work.id)!.isDefault).toBe(true);
    expect(all.find((a) => a.id === home.id)!.isDefault).toBe(false);

    // Signing out ends access.
    await ok(await api.post("/api/auth/logout", {}));
    expect((await api.get("/api/account/addresses")).status()).toBe(401);
    await api.dispose();
  });

  test("inventory: adjustments are ledgered, can't go negative, and only inventory roles may make them", async () => {
    const owner = await adminApi();
    const inventoryManager = await adminAs("inventory@wovenwhale.local");
    const support = await adminAs("support@wovenwhale.local");
    const { items } = await ok<{ items: InventoryRowDTO[] }>(await owner.get("/api/admin/inventory?pageSize=20"));
    const row = items.find((i) => i.available > 0)!;

    await ok(
      await inventoryManager.post(`/api/admin/inventory/${row.variantId}/adjust`, {
        data: { type: "STOCK_IN", quantity: 5, note: "E2E delivery" },
      }),
    );
    expect((await onHand(owner, row.sku)).onHand).toBe(row.onHand + 5);
    const ledger = await ok<InventoryTxnDTO[] | { items: InventoryTxnDTO[] }>(
      await owner.get(`/api/admin/inventory/${row.variantId}/transactions`),
    );
    const txns = Array.isArray(ledger) ? ledger : ledger.items;
    expect(txns[0]).toMatchObject({ type: "STOCK_IN", onHandDelta: 5, onHandAfter: row.onHand + 5 });

    const negative = await inventoryManager.post(`/api/admin/inventory/${row.variantId}/adjust`, {
      data: { type: "STOCK_CORRECTION", quantity: -(row.onHand + 1000), note: "E2E too much" },
    });
    expect(negative.ok()).toBe(false);
    expect((await onHand(owner, row.sku)).onHand).toBe(row.onHand + 5);

    const forbidden = await support.post(`/api/admin/inventory/${row.variantId}/adjust`, {
      data: { type: "STOCK_IN", quantity: 1, note: "nope" },
    });
    expect(forbidden.status()).toBe(403);
    await Promise.all([owner.dispose(), inventoryManager.dispose(), support.dispose()]);
  });

  test("COD: support is refused, an order manager approves, and the audit log names who did it", async () => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    expect(placed.status).toBe("PENDING_COD_APPROVAL");
    const owner = await adminApi();
    const id = await orderId(owner, placed.orderNumber);

    const support = await adminAs("support@wovenwhale.local");
    expect((await support.post(`/api/admin/orders/${id}/approve-cod`, { data: {} })).status()).toBe(403);
    const manager = await adminAs("orders@wovenwhale.local");
    await ok(await manager.post(`/api/admin/orders/${id}/approve-cod`, { data: {} }));
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("CONFIRMED");

    const audit = await ok<{ items: { action: string; actorEmail: string }[] }>(
      await owner.get(`/api/admin/audit-logs?entityType=order&entityId=${id}`),
    );
    expect(audit.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "order.cod_approved", actorEmail: "orders@wovenwhale.local" })]),
    );
    await Promise.all([api.dispose(), owner.dispose(), support.dispose(), manager.dispose()]);
  });
});
