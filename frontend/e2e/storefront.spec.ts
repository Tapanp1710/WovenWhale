import { expect, test } from "@playwright/test";
import type { ProductListResponse } from "@wovenwhale/backend/contracts";
import { inStockProduct } from "./support/fixtures";

test.describe("storefront browsing", () => {
  test("every product photo is a WebP file hosted with the storefront and delivered as WebP", async ({ request, page }) => {
    const list = (await (await request.get("/api/catalog/products?pageSize=48")).json()) as ProductListResponse;
    const urls = list.items.flatMap((p) => p.images.map((i) => i.url));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^\/catalog\/.+\.webp$/);

    const original = await request.get(urls[0]!);
    expect(original.headers()["content-type"]).toBe("image/webp");
    const optimised = await request.get(`/_next/image?url=${encodeURIComponent(urls[0]!)}&w=640&q=75`, {
      headers: { Accept: "image/avif,image/webp,image/*" },
    });
    expect(optimised.headers()["content-type"]).toBe("image/webp");

    // What the browser actually loads on a product page.
    await page.goto(`/product/${list.items[0]!.slug}`);
    const img = page.locator("main img").first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.currentSrc)).toContain(encodeURIComponent("/catalog/"));
  });

  test("homepage images open their product; hero strips stay clean, the editorial photo has a heart", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByRole("list", { name: "Featured pieces" });
    const firstStrip = hero.getByRole("link").first();
    const name = await firstStrip.getAttribute("aria-label");
    expect(name).toBeTruthy();
    await expect(hero.getByRole("button")).toHaveCount(0); // no wishlist hearts on the hero
    await firstStrip.click();
    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name!);

    // The editorial photo further down opens its product and can be saved.
    await page.goto("/");
    const editorial = page.locator("#loom-title").locator("xpath=ancestor::section[1]");
    await expect(editorial.getByRole("button", { name: /to wishlist/ })).toBeVisible();
    await editorial.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/product\//);
  });

  test("desktop navigation fits on one line and never touches the wordmark", async ({ page }) => {
    for (const width of [1280, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Main" });
      const heights = await nav.locator("a, button").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(new Set(heights).size, `nav links wrap at ${width}px`).toBe(1);
      const navRight = await nav.evaluate((el) =>
        Math.max(...[...el.querySelectorAll("a, button")].map((e) => e.getBoundingClientRect().right)),
      );
      const markLeft = (await page.getByRole("link", { name: "WovenWhale home" }).boundingBox())!.x;
      expect(markLeft - navRight, `nav touches the wordmark at ${width}px`).toBeGreaterThan(24);
    }
  });

  test("browse from the homepage into a collection", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("handlooms");
    await page.getByRole("link", { name: "Browse everything" }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.getByRole("heading", { name: "Shop all" })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("search with suggestions and results page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const input = page.getByRole("searchbox", { name: "Search products" });
    await input.fill("jamdani");
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Products" })).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=jamdani/);
    await expect(page.getByRole("heading", { name: /Results for “jamdani”/ })).toBeVisible();
    const names = await page.locator("article h3").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => /jamdani/i.test(n))).toBe(true);
  });

  test("search with no matches shows a helpful empty state", async ({ page }) => {
    await page.goto("/search?q=zzqqxx");
    await expect(page.getByRole("heading", { name: "No styles match these filters" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse all styles" })).toBeVisible();
  });

  test("filters and sort are reflected in a shareable URL", async ({ page }) => {
    await page.goto("/shop");
    const sidebar = page.getByRole("complementary", { name: "Filters" });
    await sidebar.getByRole("button", { name: "L", exact: true }).click();
    await expect(page).toHaveURL(/size=L/);
    await page.getByLabel("Sort by").selectOption("price-low");
    await expect(page).toHaveURL(/sort=price-low/);
    await expect(page.getByRole("button", { name: "Remove filter Size L" })).toBeVisible();

    // Prices are ascending, sold-out pieces sink to the end, so compare in-stock cards only.
    const values = await page
      .locator("article[data-in-stock='true'] [data-price]")
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-price"))));
    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));

    // The shared URL reproduces the same view.
    const url = page.url();
    const fresh = await page.context().newPage();
    await fresh.goto(url);
    await expect(fresh.getByRole("button", { name: "Remove filter Size L" })).toBeVisible();
    await fresh.close();
  });

  test("product page: choose a size and add to the bag", async ({ page, request }) => {
    const { product, variant } = await inStockProduct(request);
    await page.goto(`/product/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();

    await page.getByRole("button", { name: "Add to bag" }).click();
    await expect(page.getByText("Choose a size to continue.")).toBeVisible();

    await page.getByRole("radio", { name: new RegExp(`^${variant.size}(,|$)`) }).click();
    await page.getByRole("button", { name: "Add to bag" }).click();

    const drawer = page.getByRole("dialog", { name: /Your bag/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: product.name })).toBeVisible();
    // The modal drawer hides the page behind it from assistive tech, so assert on the drawer itself.
    await expect(page.getByRole("dialog", { name: "Your bag (1)" })).toBeVisible();

    await drawer.getByRole("button", { name: /Increase quantity/ }).click();
    await expect(page.getByRole("dialog", { name: "Your bag (2)" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: /Bag, 2 items/ })).toBeVisible();
  });
});

test.describe("mobile", () => {
  test("filter drawer and product page @mobile", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: /^Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("button", { name: "M", exact: true }).click();
    await expect(page).toHaveURL(/size=M/);
    await sheet.getByRole("button", { name: /^Show \d+ style/ }).click();
    await expect(sheet).toBeHidden();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(0);
  });
});
