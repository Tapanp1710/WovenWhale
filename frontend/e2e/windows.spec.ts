import { expect, test } from "@playwright/test";
import { adminApi, browserAs, customerApi, customerOrder, deliverCodOrder, expireDeadline, placeOrder } from "./support/fixtures";

/**
 * RULE 5: customers may cancel within 12 hours of ordering.
 * RULE 6: returns/exchanges/refunds within 14 days of delivery.
 * Deadlines are stored server-side, so tests move the stored deadline rather
 * than the browser clock (which the application never trusts).
 */
test.describe("cancellation window", () => {
  test("customer can cancel within 12 hours", async ({ browser }) => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const context = await browserAs(browser, api);
    const page = await context.newPage();

    await page.goto(`/account/orders/${placed.orderNumber}`);
    await expect(page.getByText(/You can cancel this order until/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel order" }).click();
    const dialog = page.getByRole("dialog", { name: /Cancel order/ });
    await dialog.getByLabel("Ordered by mistake").check();
    await dialog.getByRole("button", { name: "Cancel order" }).click();

    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("CANCELLED");
    await Promise.all([context.close(), api.dispose()]);
  });

  test("cancellation is refused after 12 hours", async ({ browser }) => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    await expireDeadline(placed.orderNumber, "cancel_deadline_at");

    const context = await browserAs(browser, api);
    const page = await context.newPage();
    await page.goto(`/account/orders/${placed.orderNumber}`);
    await expect(page.getByRole("heading", { name: `Order ${placed.orderNumber}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

    // The server enforces it even if the UI were bypassed.
    const res = await api.post(`/api/orders/${placed.orderNumber}/cancel`, { data: { reason: "Too late" } });
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("CANCEL_WINDOW_EXPIRED");
    await Promise.all([context.close(), api.dispose()]);
  });
});

test.describe("return window", () => {
  test("return request allowed within 14 days of delivery", async ({ browser }) => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const admin = await adminApi();
    await deliverCodOrder(admin, placed.orderNumber);

    const context = await browserAs(browser, api);
    const page = await context.newPage();
    await page.goto(`/account/orders/${placed.orderNumber}`);
    await expect(page.getByText(/Returns and exchanges are open until/)).toBeVisible();
    await page.getByRole("button", { name: "Return or exchange items" }).click();

    const sheet = page.getByRole("dialog", { name: "Return or exchange" });
    await sheet
      .getByRole("radio", { name: /Return/ })
      .first()
      .check();
    await sheet.getByRole("checkbox").first().check();
    await sheet.getByLabel("Reason").selectOption("SIZE_ISSUE");
    await sheet.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByText(/Request RT\w+ sent/)).toBeVisible();
    const order = await customerOrder(api, placed.orderNumber);
    expect(order.returns[0]?.status).toBe("REQUESTED");
    await Promise.all([context.close(), api.dispose(), admin.dispose()]);
  });

  test("return request refused after 14 days", async ({ browser }) => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const admin = await adminApi();
    await deliverCodOrder(admin, placed.orderNumber);
    await expireDeadline(placed.orderNumber, "return_deadline_at");

    const context = await browserAs(browser, api);
    const page = await context.newPage();
    await page.goto(`/account/orders/${placed.orderNumber}`);
    await expect(page.getByText(/return window for this order has closed/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Return or exchange items" })).toHaveCount(0);

    const order = await customerOrder(api, placed.orderNumber);
    const res = await api.post(`/api/orders/${placed.orderNumber}/returns`, {
      data: { type: "RETURN", reason: "SIZE_ISSUE", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] },
    });
    expect(res.status()).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RETURN_WINDOW_EXPIRED");
    await Promise.all([context.close(), api.dispose(), admin.dispose()]);
  });
});
