import { expect, test, type Page } from "@playwright/test";
import {
  OTP_CODE,
  adminApi,
  browserAs,
  customerApi,
  customerOrder,
  inStockProduct,
  orderId,
  placeOrder,
  uniquePhone,
} from "./support/fixtures";

async function addToBag(page: Page, slug: string, size: string) {
  await page.goto(`/product/${slug}`);
  await page.getByRole("radio", { name: new RegExp(`^${size}(,|$)`) }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
}

async function signInAndAddAddress(page: Page, phone: string) {
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Verification code").fill(OTP_CODE);
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await page.getByLabel("Full name").fill("Priya Nair");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Flat, house number, building").fill("Flat 3B, Sea Breeze");
  await page.getByLabel("Street").fill("MG Road");
  await page.getByLabel("Area or locality").fill("Ernakulam");
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("State").selectOption("Kerala");
  await page.getByLabel("Pincode").fill("682016");
  await page.getByRole("button", { name: "Deliver to this address" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
}

test.describe("checkout", () => {
  test("prepaid: guest bag → sign in → address → pay → confirmed", async ({ page, request }) => {
    const { product, variant } = await inStockProduct(request);
    await addToBag(page, product.slug, variant.size);
    await page
      .getByRole("dialog", { name: /Your bag/ })
      .getByRole("link", { name: "Checkout" })
      .click();

    await signInAndAddAddress(page, uniquePhone());
    await page.getByRole("radio", { name: /Pay online/ }).check();
    await page.getByRole("button", { name: /^Pay ₹/ }).click();

    const gateway = page.getByRole("dialog", { name: "Test payment" });
    await expect(gateway).toBeVisible();
    await gateway.getByRole("button", { name: /^Pay ₹/ }).click();

    await expect(page).toHaveURL(/\/checkout\/confirmation\/WW/);
    await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible();
    await expect(page.getByText("Paid online")).toBeVisible();
  });

  test("declined payment keeps the order recoverable", async ({ page, request }) => {
    const { product, variant } = await inStockProduct(request);
    await addToBag(page, product.slug, variant.size);
    await page.goto("/checkout");
    await signInAndAddAddress(page, uniquePhone());
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await page.getByRole("dialog", { name: "Test payment" }).getByRole("button", { name: "Simulate a declined payment" }).click();

    await expect(page.getByText(/didn.t go through/)).toBeVisible();
    await page.getByRole("button", { name: "Try payment again" }).click();
    await page
      .getByRole("dialog", { name: "Test payment" })
      .getByRole("button", { name: /^Pay ₹/ })
      .click();
    await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible();
  });
});

test.describe("cash on delivery", () => {
  test("COD order waits for admin approval, then becomes confirmed", async ({ page, request }) => {
    const { product, variant } = await inStockProduct(request);
    await addToBag(page, product.slug, variant.size);
    await page.goto("/checkout");
    await signInAndAddAddress(page, uniquePhone());
    await page.getByRole("radio", { name: /Cash on delivery/ }).check();
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByRole("heading", { name: /We've received your order/ })).toBeVisible();
    const orderNumber = (await page.url()).split("/").pop()!;

    // Never auto-confirmed (RULE 2).
    await page.getByRole("link", { name: "View order" }).click();
    await expect(page.getByText("Awaiting confirmation", { exact: true }).first()).toBeVisible();

    // It appears in the admin approval queue and an authorised admin approves it.
    const admin = await adminApi();
    const queue = (await (await admin.get("/api/admin/orders/cod-pending")).json()) as { orderNumber: string }[];
    expect(queue.map((o) => o.orderNumber)).toContain(orderNumber);
    const approve = await admin.post(`/api/admin/orders/${await orderId(admin, orderNumber)}/approve-cod`, { data: {} });
    expect(approve.ok()).toBe(true);

    await page.reload();
    await expect(page.getByText("Confirmed", { exact: true }).first()).toBeVisible();
    await admin.dispose();
  });

  test("rejected COD order ends as REJECTED and releases stock", async () => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    expect(placed.status).toBe("PENDING_COD_APPROVAL");

    const admin = await adminApi();
    const id = await orderId(admin, placed.orderNumber);
    const res = await admin.post(`/api/admin/orders/${id}/reject-cod`, { data: { reason: "Could not verify address" } });
    expect(res.ok()).toBe(true);
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("REJECTED");
    await Promise.all([api.dispose(), admin.dispose()]);
  });

  test("the API refuses to confirm COD without approval permission", async () => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    // A customer session cannot reach admin approval at all.
    const res = await api.post(`/api/admin/orders/${placed.orderNumber}/approve-cod`, { data: {} });
    expect(res.status()).toBe(401);
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("PENDING_COD_APPROVAL");
    await api.dispose();
  });
});

test.describe("order page", () => {
  test("customer sees their order and no one else's", async ({ browser }) => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const context = await browserAs(browser, api);
    const page = await context.newPage();
    await page.goto(`/account/orders/${placed.orderNumber}`);
    await expect(page.getByRole("heading", { name: `Order ${placed.orderNumber}` })).toBeVisible();

    const stranger = await customerApi();
    const res = await stranger.api.get(`/api/orders/${placed.orderNumber}`);
    expect(res.status()).toBe(404);
    await Promise.all([context.close(), api.dispose(), stranger.api.dispose()]);
  });
});
