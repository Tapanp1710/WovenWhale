import { expect, request as playwrightRequest, test } from "@playwright/test";
import { BASE_URL, adminApi, customerApi, customerOrder, orderId, placeOrder } from "./support/fixtures";

const ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? "owner@wovenwhale.local";
const ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe!2026";

test.describe("admin", () => {
  test("admin routes require sign-in", async ({ page }) => {
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders/);
  });

  test("wrong password is refused without revealing which part was wrong", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill("definitely-not-it");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("approve a COD order from the dashboard queue", async ({ page }) => {
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");

    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto("/admin/cod");
    const row = page.locator("li, tr, article").filter({ hasText: placed.orderNumber }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Approve/ }).click();
    const confirm = page.getByRole("dialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /Approve/ }).click();

    await expect(page.locator("li, tr, article").filter({ hasText: placed.orderNumber })).toHaveCount(0);
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("CONFIRMED");
    await api.dispose();
  });

  test("RBAC: a support admin cannot approve COD orders", async () => {
    const owner = await adminApi();
    const email = `support-${Date.now()}@wovenwhale.local`;
    const password = "Support-Test-2026";
    const created = await owner.post("/api/admin/admins", { data: { email, fullName: "Support Tester", role: "SUPPORT", password } });
    expect(created.ok()).toBe(true);

    const support = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
    expect((await support.post("/api/admin/auth/login", { data: { email, password } })).ok()).toBe(true);

    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const id = await orderId(owner, placed.orderNumber);

    // Support can read the order…
    expect((await support.get(`/api/admin/orders/${id}`)).ok()).toBe(true);
    // …but not approve it, change stock or manage coupons.
    expect((await support.post(`/api/admin/orders/${id}/approve-cod`, { data: {} })).status()).toBe(403);
    expect((await support.post("/api/admin/coupons", { data: { code: "NOPE10", type: "PERCENTAGE", value: 10 } })).status()).toBe(403);
    expect((await customerOrder(api, placed.orderNumber)).status).toBe("PENDING_COD_APPROVAL");

    // The attempt left no approval in the audit trail.
    const audit = (await (await owner.get(`/api/admin/audit-logs?entityType=order&entityId=${id}`)).json()) as {
      items: { action: string }[];
    };
    expect(audit.items.map((a) => a.action)).not.toContain("order.cod_approved");
    await Promise.all([owner.dispose(), support.dispose(), api.dispose()]);
  });
});
