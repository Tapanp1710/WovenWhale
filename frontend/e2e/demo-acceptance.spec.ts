import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import type { OrderSummaryDTO, Paginated, PlaceOrderResultDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import { BASE_URL, customerOrder, inStockProduct, totp } from "./support/fixtures";

/**
 * Acceptance walkthrough for a DEMO deployment (DEMO_MODE, demo accounts
 * seeded). Works whether admin 2FA is on (pass DEMO_TOTP_SECRET) or off:
 *
 *   E2E_DEMO=1 E2E_BASE_URL=https://<storefront> [DEMO_TOTP_SECRET=<key>] npx playwright test e2e/demo-acceptance.spec.ts
 *
 * Skipped in the normal local run.
 */
const SECRET = process.env.DEMO_TOTP_SECRET ?? "";
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "Demo-Only-2026!";
const DEMO_PHONE = "7000099999";

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_DEMO && !SECRET, "Set E2E_DEMO=1 (and DEMO_TOTP_SECRET when 2FA is on) to run the demo walkthrough");

const context = () => playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

// One sign-in for the whole walkthrough: the OTP resend cooldown (30 s) applies to demo users too.
let signedIn: Promise<APIRequestContext> | null = null;
function customer(phone: string) {
  signedIn ??= (async () => {
    const api = await context();
    await ok(await api.post("/api/auth/otp/send", { data: { phone } }));
    await ok(await api.post("/api/auth/otp/verify", { data: { phone, code: "123456" } }));
    return api;
  })();
  return signedIn;
}

// Each admin uses a later time step than the last one (a code can never be used twice).
let step = 0;
async function admin(email: string) {
  const api = await context();
  const login = await ok<{ step: string }>(await api.post("/api/admin/auth/login", { data: { email, password: PASSWORD } }));
  if (login.step === "verify") {
    // With 2FA on, the password alone gives no access.
    expect((await api.get("/api/admin/orders")).status()).toBe(401);
    await ok(await api.post("/api/admin/auth/2fa/verify", { data: { method: "totp", code: totp(SECRET, step++ % 2) } }));
  } else {
    expect(login.step).toBe("done");
  }
  return api;
}

async function order(api: APIRequestContext, method: "COD" | "PREPAID") {
  const { variant } = await inStockProduct(api);
  await ok(await api.post("/api/cart/items", { data: { variantId: variant.id, quantity: 1 } }));
  const addresses = await ok<{ id: string; isDefault: boolean }[]>(await api.get("/api/account/addresses"));
  const quote = await ok<{ totals: { totalPaise: number } }>(await api.get(`/api/checkout/quote?paymentMethod=${method}`));
  return ok<PlaceOrderResultDTO>(
    await api.post("/api/checkout/orders", {
      data: {
        addressId: addresses.find((a) => a.isDefault)!.id,
        paymentMethod: method,
        idempotencyKey: crypto.randomUUID(),
        expectedTotalPaise: quote.totals.totalPaise,
      },
    }),
  );
}

test("storefront is live, labelled as a demo and serves the catalog", async ({ page }) => {
  const api = await context();
  expect(await ok(await api.get("/api/health"))).toEqual({ status: "ok" });
  const config = await ok<StoreConfigDTO>(await api.get("/api/catalog/config"));
  expect(config.demo).not.toBeNull();
  await page.goto("/");
  await expect(page.getByRole("note").filter({ hasText: "Demo store" })).toBeVisible();
  await page.goto("/shop");
  await expect(page.locator("[data-in-stock]").first()).toBeVisible();
  await api.dispose();
});

test("customer: prepaid order is confirmed by the verified payment, no admin step", async () => {
  const api = await customer(DEMO_PHONE);
  const placed = await order(api, "PREPAID");
  const paid = await ok<{ callback?: Record<string, unknown> }>(
    await api.post("/api/dev/mock-gateway/pay", {
      data: { providerOrderId: placed.payment!.clientCheckout.providerOrderId, outcome: "success", amountPaise: placed.totalPaise },
    }),
  );
  await ok(await api.post("/api/payments/verify", { data: { orderNumber: placed.orderNumber, payload: paid.callback } }));
  const detail = await customerOrder(api, placed.orderNumber);
  expect(detail.status).toBe("CONFIRMED");
  expect(detail.paymentStatus).toBe("PAYMENT_SUCCESS");
});

test("customer: seeded orders allow a cancellation and a return", async () => {
  const api = await customer(DEMO_PHONE);
  const { items } = await ok<Paginated<OrderSummaryDTO>>(await api.get("/api/orders?pageSize=50"));
  const cancellable = items.find((o) => o.status === "CONFIRMED" && o.paymentMethod === "PREPAID");
  if (cancellable) {
    await ok(await api.post(`/api/orders/${cancellable.orderNumber}/cancel`, { data: { reason: "Ordered by mistake" } }));
    expect((await customerOrder(api, cancellable.orderNumber)).status).toBe("CANCELLED");
  }
  const delivered = items.find((o) => o.status === "DELIVERED");
  expect(delivered, "the demo customer has a delivered order").toBeTruthy();
  const detail = await customerOrder(api, delivered!.orderNumber);
  const item = detail.items.find((i) => i.returnableQuantity > 0);
  if (item) {
    await ok(
      await api.post(`/api/orders/${delivered!.orderNumber}/returns`, {
        data: { type: "RETURN", reason: "SIZE_ISSUE", items: [{ orderItemId: item.id, quantity: 1 }] },
      }),
    );
  }
  expect((await customerOrder(api, delivered!.orderNumber)).returns.length).toBeGreaterThan(0);
});

test("security + COD: support is refused, the order manager approves, the audit log shows who", async () => {
  const shopper = await customer(DEMO_PHONE);
  const placed = await order(shopper, "COD");
  expect(placed.status).toBe("PENDING_COD_APPROVAL");

  const owner = await admin("owner@wovenwhale.local");
  const { items } = await ok<{ items: { id: string }[] }>(await owner.get(`/api/admin/orders?q=${placed.orderNumber}`));
  const id = items[0]!.id;

  const support = await admin("support@wovenwhale.local");
  expect((await support.post(`/api/admin/orders/${id}/approve-cod`, { data: {} })).status()).toBe(403);

  const manager = await admin("orders@wovenwhale.local");
  await ok(await manager.post(`/api/admin/orders/${id}/approve-cod`, { data: {} }));
  expect((await customerOrder(shopper, placed.orderNumber)).status).toBe("CONFIRMED");

  const audit = await ok<{ items: { action: string; actorEmail: string }[] }>(
    await owner.get(`/api/admin/audit-logs?entityType=order&entityId=${id}`),
  );
  expect(audit.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ action: "order.cod_approved", actorEmail: "orders@wovenwhale.local" })]),
  );

  // Cross-site requests are refused.
  const foreign = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: "https://evil.example" } });
  expect((await foreign.post("/api/auth/otp/send", { data: { phone: DEMO_PHONE } })).status()).toBe(403);
  await Promise.all([owner.dispose(), support.dispose(), manager.dispose(), foreign.dispose()]);
});

test("admin UI: sign in (with the authenticator code when 2FA is on) and reach the dashboard", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@wovenwhale.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  const twoFactor = page.getByRole("heading", { name: "Two-factor verification" });
  const dashboard = page.getByRole("heading", { name: "Dashboard" });
  await expect(twoFactor.or(dashboard)).toBeVisible();
  if (await twoFactor.isVisible()) {
    await page.getByLabel("Authenticator code").fill(totp(SECRET, 1));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await expect(dashboard).toBeVisible();
});
