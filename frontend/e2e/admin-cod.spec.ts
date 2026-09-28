import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import type { AdminOrderRowDTO } from "@wovenwhale/backend/contracts";
import postgres from "postgres";
import { BASE_URL, adminApi, customerApi, customerOrder, orderId, placeOrder } from "./support/fixtures";

const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "Demo-Only-2026!";

async function adminAs(email: string) {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  expect((await api.post("/api/admin/auth/login", { data: { email, password: DEMO_PASSWORD } })).ok()).toBe(true);
  return api;
}

const queue = async (admin: APIRequestContext) =>
  ((await (await admin.get("/api/admin/orders/cod-pending")).json()) as AdminOrderRowDTO[]).map((o) => o.orderNumber);

async function codOrder() {
  const { api, phone } = await customerApi();
  const placed = await placeOrder(api, phone, "COD");
  return { api, orderNumber: placed.orderNumber };
}

test.describe("COD approvals: inline actions", () => {
  test("approve, reject (with confirmation) and remind later from the orders list", async ({ browser }) => {
    const owner = await adminApi();
    const [a, b, c] = [await codOrder(), await codOrder(), await codOrder()];
    const staff = await browser.newContext({ storageState: await owner.storageState(), baseURL: BASE_URL });
    const page = await staff.newPage();
    await page.goto("/admin/orders?status=PENDING_COD_APPROVAL");
    const rowOf = (n: string) => page.locator(`tr[data-order="${n}"]`);

    // Approve inline: one request even on a double click, then the row leaves the pending list.
    let approveCalls = 0;
    page.on("request", (r) => r.method() === "POST" && r.url().includes("/approve-cod") && approveCalls++);
    await rowOf(a.orderNumber)
      .getByRole("button", { name: `Approve COD order ${a.orderNumber}` })
      .dblclick();
    await expect(rowOf(a.orderNumber)).toHaveCount(0);
    expect(approveCalls).toBe(1);
    expect((await customerOrder(a.api, a.orderNumber)).status).toBe("CONFIRMED");

    // Reject needs a confirmation.
    await rowOf(b.orderNumber)
      .getByRole("button", { name: `Reject COD order ${b.orderNumber}` })
      .click();
    const confirm = page.getByRole("dialog", { name: "Reject this COD order?" });
    await expect(confirm.getByText(/will not create a payment refund because this is a COD order/)).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    expect((await customerOrder(b.api, b.orderNumber)).status).toBe("PENDING_COD_APPROVAL");
    await rowOf(b.orderNumber)
      .getByRole("button", { name: `Reject COD order ${b.orderNumber}` })
      .click();
    await confirm.getByLabel("Reason for the customer").fill("Could not reach the customer");
    await confirm.getByRole("button", { name: "Reject order" }).click();
    await expect(rowOf(b.orderNumber)).toHaveCount(0);
    const rejected = await customerOrder(b.api, b.orderNumber);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.refunds).toHaveLength(0); // nothing was paid, so nothing to refund

    // Remind later: saved on the server, status unchanged, out of the approval queue.
    await rowOf(c.orderNumber)
      .getByRole("button", { name: `Remind me later about COD order ${c.orderNumber}` })
      .click();
    await expect(page.getByText(/Reminder set/)).toBeVisible();
    await expect(rowOf(c.orderNumber).getByText(/Reminder/)).toBeVisible();
    expect((await customerOrder(c.api, c.orderNumber)).status).toBe("PENDING_COD_APPROVAL");
    expect(await queue(owner)).not.toContain(c.orderNumber);
    await page.goto("/admin/cod");
    await expect(page.getByText(c.orderNumber)).toHaveCount(0);

    // When the reminder time passes, it's actionable again.
    const sql = postgres(process.env.DATABASE_URL ?? "postgres://wovenwhale:wovenwhale@localhost:54329/wovenwhale", { onnotice: () => {} });
    await sql`update orders set cod_review_reminded_until = now() - interval '1 minute' where order_number = ${c.orderNumber}`;
    await sql.end();
    expect(await queue(owner)).toContain(c.orderNumber);

    const id = await orderId(owner, c.orderNumber);
    const audit = (await (await owner.get(`/api/admin/audit-logs?entityType=order&entityId=${id}`)).json()) as {
      items: { action: string }[];
    };
    expect(audit.items.map((x) => x.action)).toContain("order.cod_reminder_set");
    await Promise.all([staff.close(), owner.dispose(), a.api.dispose(), b.api.dispose(), c.api.dispose()]);
  });

  test("the COD queue page has the same inline actions", async ({ browser }) => {
    const owner = await adminApi();
    const order = await codOrder();
    const staff = await browser.newContext({ storageState: await owner.storageState(), baseURL: BASE_URL });
    const page = await staff.newPage();
    await page.goto("/admin/cod");
    const actions = page.locator(`[data-cod-actions="${order.orderNumber}"]`);
    await expect(actions.getByRole("button", { name: /Remind me later/ })).toBeVisible();
    await actions.getByRole("button", { name: `Approve COD order ${order.orderNumber}` }).click();
    await expect(actions).toHaveCount(0);
    expect((await customerOrder(order.api, order.orderNumber)).status).toBe("CONFIRMED");
    await Promise.all([staff.close(), owner.dispose(), order.api.dispose()]);
  });

  test("support can't approve or snooze; parallel approvals apply once", async () => {
    const owner = await adminApi();
    const order = await codOrder();
    const id = await orderId(owner, order.orderNumber);
    const support = await adminAs("support@wovenwhale.local");
    expect((await support.post(`/api/admin/orders/${id}/approve-cod`, { data: {} })).status()).toBe(403);
    expect((await support.post(`/api/admin/orders/${id}/remind-cod`, { data: {} })).status()).toBe(403);
    expect((await customerOrder(order.api, order.orderNumber)).status).toBe("PENDING_COD_APPROVAL");

    const manager = await adminAs("orders@wovenwhale.local");
    const results = await Promise.all([1, 2, 3].map(() => manager.post(`/api/admin/orders/${id}/approve-cod`, { data: {} })));
    expect(results.filter((r) => r.ok())).toHaveLength(1);
    const audit = (await (await owner.get(`/api/admin/audit-logs?entityType=order&entityId=${id}`)).json()) as {
      items: { action: string }[];
    };
    expect(audit.items.filter((x) => x.action === "order.cod_approved")).toHaveLength(1);
    // A reminder on a decided order is refused.
    expect((await manager.post(`/api/admin/orders/${id}/remind-cod`, { data: {} })).status()).toBe(409);
    await Promise.all([owner.dispose(), support.dispose(), manager.dispose(), order.api.dispose()]);
  });
});
