import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import type {
  AdminCategoryDTO,
  AdminProductDetailDTO,
  AdminProductRowDTO,
  InventoryTxnDTO,
  Paginated,
} from "@wovenwhale/backend/contracts";
import { BASE_URL, adminApi, customerApi, customerOrder, placeOrder } from "./support/fixtures";

const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "Demo-Only-2026!";

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

async function adminAs(email: string) {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  await ok(await api.post("/api/admin/auth/login", { data: { email, password: DEMO_PASSWORD } }));
  return api;
}

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();

async function createProduct(owner: APIRequestContext, opts: { stock?: number } = {}) {
  const id = unique();
  const [category] = await ok<AdminCategoryDTO[]>(await owner.get("/api/admin/catalog/categories"));
  const product = await ok<AdminProductDetailDTO>(
    await owner.post("/api/admin/catalog/products", {
      data: {
        name: `E2E Kanaka Shirt ${id}`,
        slug: `e2e-kanaka-shirt-${id.toLowerCase()}`,
        sku: `E2E-${id}`,
        productType: "Shirt",
        mrp: 1499,
        price: 1099,
        categoryIds: [category!.id],
        isActive: false,
        tags: [],
      },
    }),
  );
  if (opts.stock !== undefined) {
    await ok(
      await owner.post(`/api/admin/catalog/products/${product.id}/variants`, {
        data: { size: "M", sku: `E2E-${id}-M`, initialStock: opts.stock || undefined, isActive: true, sortOrder: 1 },
      }),
    );
  }
  return ok<AdminProductDetailDTO>(await owner.get(`/api/admin/catalog/products/${product.id}`));
}

const row = async (api: APIRequestContext, sku: string, query = "") =>
  (await ok<Paginated<AdminProductRowDTO>>(await api.get(`/api/admin/catalog/products?q=${sku}${query}`))).items.find((p) => p.sku === sku);

const auditActions = async (owner: APIRequestContext, entityType: string, id: string) =>
  (
    await ok<{ items: { action: string; actorEmail: string }[] }>(
      await owner.get(`/api/admin/audit-logs?entityType=${entityType}&entityId=${id}`),
    )
  ).items;

test.describe("admin products and inventory (API)", () => {
  test("create → edit → restock → adjust → ledger → low/out of stock → audit", async () => {
    const owner = await adminApi();
    const product = await createProduct(owner, { stock: 33 });
    expect(product.status).toBe("DRAFT"); // new products start hidden
    const variant = product.variants[0]!;
    expect(variant.onHand).toBe(33);

    // Edit.
    await ok(
      await owner.put(`/api/admin/catalog/products/${product.id}`, {
        data: {
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          productType: "Shirt",
          mrp: 1599,
          price: 1199,
          categoryIds: product.categoryIds,
          isActive: false,
          tags: [],
          shortDescription: "Edited by E2E",
        },
      }),
    );

    // Restock +20 (33 → 53), then adjust −3 (53 → 50).
    await ok(
      await owner.post(`/api/admin/inventory/${variant.id}/adjust`, {
        data: { type: "STOCK_IN", quantity: 20, note: "Supplier delivery" },
      }),
    );
    await ok(
      await owner.post(`/api/admin/inventory/${variant.id}/adjust`, {
        data: { type: "MANUAL_ADJUSTMENT", quantity: -3, note: "Damaged items" },
      }),
    );
    const ledger = await ok<InventoryTxnDTO[]>(await owner.get(`/api/admin/inventory/${variant.id}/transactions`));
    expect(ledger.slice(0, 3).map((t) => [t.type, t.onHandDelta, t.onHandAfter - t.onHandDelta, t.onHandAfter, t.note])).toEqual([
      ["MANUAL_ADJUSTMENT", -3, 53, 50, "Damaged items"],
      ["STOCK_IN", 20, 33, 53, "Supplier delivery"],
      ["STOCK_IN", 33, 0, 33, "Opening stock"],
    ]);
    expect(ledger[0]!.actor).toBeTruthy();

    // Stock can't go negative.
    const tooMuch = await owner.post(`/api/admin/inventory/${variant.id}/adjust`, {
      data: { type: "MANUAL_ADJUSTMENT", quantity: -51, note: "Too many" },
    });
    expect(tooMuch.status()).toBe(409);
    expect(((await tooMuch.json()) as { error: { message: string } }).error.message).toBe("Insufficient stock.");

    // Low stock (≤ threshold 3) and out of stock, as the list and its filters see them.
    await ok(
      await owner.post(`/api/admin/inventory/${variant.id}/adjust`, { data: { type: "MANUAL_ADJUSTMENT", quantity: -48, note: "Count" } }),
    );
    expect((await row(owner, product.sku))!).toMatchObject({ totalStock: 2, stockState: "LOW_STOCK" });
    expect(await row(owner, product.sku, "&stock=LOW_STOCK")).toBeTruthy();
    await ok(
      await owner.post(`/api/admin/inventory/${variant.id}/adjust`, { data: { type: "MANUAL_ADJUSTMENT", quantity: -2, note: "Count" } }),
    );
    expect((await row(owner, product.sku))!).toMatchObject({ totalStock: 0, stockState: "OUT_OF_STOCK" });
    expect(await row(owner, product.sku, "&stock=OUT_OF_STOCK")).toBeTruthy();
    expect(await row(owner, product.sku, "&stock=IN_STOCK")).toBeUndefined();

    // Audit trail: product edits on the product, stock changes on the size.
    expect((await auditActions(owner, "product", product.id)).map((a) => a.action)).toEqual(
      expect.arrayContaining(["product.created", "variant.created"]),
    );
    expect(
      (await auditActions(owner, "product", product.id))
        .map((a) => a.action)
        .some((a) => a.startsWith("product.") && a !== "product.created"),
    ).toBe(true);
    expect((await auditActions(owner, "variant", variant.id)).map((a) => a.action)).toEqual(
      expect.arrayContaining(["inventory.restocked", "inventory.adjusted"]),
    );
    await owner.dispose();
  });

  test("archive → hidden from the store; restore needs a sellable product; delete only when unused", async ({ request }) => {
    const owner = await adminApi();
    const product = await createProduct(owner, { stock: 5 });

    await ok(await owner.post(`/api/admin/catalog/products/${product.id}/archive`));
    expect(await row(owner, product.sku)).toBeUndefined(); // default list: active and drafts
    expect((await row(owner, product.sku, "&status=ARCHIVED"))!.status).toBe("ARCHIVED");
    expect((await request.get(`/api/catalog/products/${product.slug}`)).status()).toBe(404);
    // Archived products can't be edited until restored.
    expect((await owner.put(`/api/admin/catalog/products/${product.id}`, { data: { ...product, mrp: 1, price: 1 } })).status()).toBe(409);

    // No photo yet: publishing straight away is refused; restoring as a draft works.
    const publish = await owner.post(`/api/admin/catalog/products/${product.id}/restore`, { data: { to: "ACTIVE" } });
    expect(publish.status()).toBe(409);
    expect(
      (await ok<AdminProductDetailDTO>(await owner.post(`/api/admin/catalog/products/${product.id}/restore`, { data: { to: "DRAFT" } })))
        .status,
    ).toBe("DRAFT");

    // It has stock history, so it can't be deleted permanently, only archived.
    await ok(await owner.post(`/api/admin/catalog/products/${product.id}/archive`));
    const inUse = await owner.delete(`/api/admin/catalog/products/${product.id}`);
    expect(inUse.status()).toBe(409);
    expect(((await inUse.json()) as { error: { code: string } }).error.code).toBe("PRODUCT_IN_USE");

    // A product created by mistake (never stocked, never sold) can be removed.
    const mistake = await createProduct(owner);
    expect(mistake.deletable).toBe(true);
    expect((await owner.delete(`/api/admin/catalog/products/${mistake.id}`)).status()).toBe(409); // archive first
    await ok(await owner.post(`/api/admin/catalog/products/${mistake.id}/archive`));
    await ok(await owner.delete(`/api/admin/catalog/products/${mistake.id}`));
    expect((await owner.get(`/api/admin/catalog/products/${mistake.id}`)).status()).toBe(404);

    const actions = (await auditActions(owner, "product", product.id)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["product.archived", "product.restored"]));
    await owner.dispose();
  });

  test("a product that has been ordered can never be deleted", async () => {
    const owner = await adminApi();
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const productId = (await customerOrder(api, placed.orderNumber)).items[0]!.productId;

    const detail = await ok<AdminProductDetailDTO>(await owner.get(`/api/admin/catalog/products/${productId}`));
    expect(detail.deletable).toBe(false);
    // Even straight through the API it can only be archived, never deleted.
    expect((await owner.delete(`/api/admin/catalog/products/${productId}`)).status()).toBe(409);
    await ok(await owner.post(`/api/admin/catalog/products/${productId}/archive`));
    const refused = await owner.delete(`/api/admin/catalog/products/${productId}`);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("PRODUCT_IN_USE");
    // The order still shows its product line after archiving.
    expect((await customerOrder(api, placed.orderNumber)).items[0]!.productId).toBe(productId);
    await ok(await owner.post(`/api/admin/catalog/products/${productId}/restore`, { data: { to: "ACTIVE" } }));
    await Promise.all([owner.dispose(), api.dispose()]);
  });

  test("RBAC: support can't touch products or stock; inventory managers restock but don't edit the catalogue", async () => {
    const owner = await adminApi();
    const product = await createProduct(owner, { stock: 10 });
    const variantId = product.variants[0]!.id;
    const support = await adminAs("support@wovenwhale.local");
    const inventory = await adminAs("inventory@wovenwhale.local");

    const stockIn = { data: { type: "STOCK_IN", quantity: 1, note: "Supplier delivery" } };
    expect((await support.post(`/api/admin/inventory/${variantId}/adjust`, stockIn)).status()).toBe(403);
    expect((await support.post(`/api/admin/catalog/products/${product.id}/archive`)).status()).toBe(403);
    expect((await support.post("/api/admin/catalog/products", { data: { name: "Nope" } })).status()).toBe(403);

    await ok(await inventory.post(`/api/admin/inventory/${variantId}/adjust`, stockIn));
    expect((await inventory.post(`/api/admin/catalog/products/${product.id}/archive`)).status()).toBe(403);
    const audit = await auditActions(owner, "variant", variantId);
    expect(audit).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "inventory.restocked", actorEmail: "inventory@wovenwhale.local" })]),
    );
    await Promise.all([owner.dispose(), support.dispose(), inventory.dispose()]);
  });
});

test.describe("admin products (UI)", () => {
  test("add a product, restock, adjust, see the history, archive and restore", async ({ page, browser }) => {
    const owner = await adminApi();
    const staff = await browser.newContext({ storageState: await owner.storageState(), baseURL: BASE_URL });
    page = await staff.newPage();
    const id = unique();
    const name = `E2E Linen Shirt ${id}`;
    const sku = `UI-${id}`;

    // Add product.
    await page.goto("/admin/products");
    await page.getByRole("link", { name: "Add product" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("URL slug").fill(`e2e-linen-shirt-${id.toLowerCase()}`);
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Selling price (₹)").fill("1099");
    await page.getByLabel("MRP (₹)").fill("1499");
    await page.locator("fieldset").getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

    // A size with opening stock.
    await page.getByRole("button", { name: "Add size" }).click();
    const sizeDialog = page.getByRole("dialog");
    await sizeDialog.getByLabel("Size").fill("M");
    await sizeDialog.getByLabel("SKU").fill(`${sku}-M`);
    await sizeDialog.getByLabel("Opening stock").fill("33");
    await sizeDialog
      .getByRole("button", { name: /save|add/i })
      .last()
      .click();
    await expect(page.getByRole("button", { name: "Restock size M" })).toBeVisible();

    // It's in the list.
    await page.goto(`/admin/products?q=${sku}`);
    const productRow = page.locator(`tr[data-product="${sku}"]`);
    await expect(productRow).toBeVisible();
    await expect(productRow.locator("td[data-stock]")).toHaveAttribute("data-stock", "33");

    // Restock 33 → 53.
    await productRow.getByRole("button", { name: `Restock ${name}` }).click();
    let dialog = page.getByRole("dialog", { name: "Restock product" });
    await expect(dialog.getByText("Current stock")).toBeVisible();
    await dialog.getByLabel("Quantity to add").fill("20");
    await expect(dialog.getByText(/New stock: 33 → 53/)).toBeVisible();
    await dialog.getByRole("button", { name: "Restock" }).click();
    await expect(productRow.locator("td[data-stock]")).toHaveAttribute("data-stock", "53");

    // Adjust −3 → 50.
    await productRow.getByRole("button", { name: `More actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Adjust stock" }).click();
    dialog = page.getByRole("dialog", { name: "Adjust stock" });
    await dialog.getByLabel("Quantity").fill("3");
    await dialog.getByLabel("Reason").fill("Damaged items");
    await expect(dialog.getByText(/New stock: 53 → 50/)).toBeVisible();
    await dialog.getByRole("button", { name: "Save adjustment" }).click();
    await expect(productRow.locator("td[data-stock]")).toHaveAttribute("data-stock", "50");

    // Stock history from the ledger.
    await productRow.getByRole("button", { name: `More actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Stock history" }).click();
    const history = page.getByRole("list", { name: "Stock movements" });
    await expect(history.getByText("Damaged items")).toBeVisible();
    await expect(history.getByText("(53 → 50)")).toBeVisible();
    await expect(history.getByText("(33 → 53)")).toBeVisible();
    await page.keyboard.press("Escape");

    // Archive: gone from the default list, visible under Archived.
    await productRow.getByRole("button", { name: `More actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.getByRole("dialog", { name: "Archive this product?" }).getByRole("button", { name: "Archive product" }).click();
    await expect(productRow).toHaveCount(0);
    await page.goto(`/admin/products?q=${sku}&status=ARCHIVED`);
    await expect(productRow.getByText("Archived", { exact: true })).toBeVisible();

    // Restore as a draft.
    await productRow.getByRole("button", { name: `More actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await page.getByRole("button", { name: "Restore as draft" }).click();
    await page.goto(`/admin/products?q=${sku}`);
    await expect(productRow.getByText("Draft", { exact: true })).toBeVisible();
    await Promise.all([staff.close(), owner.dispose()]);
  });
});
