import { expect, test, type Page } from "@playwright/test";
import type { ProductListResponse } from "@wovenwhale/backend/contracts";
import { adminApi, browserAs, customerApi, placeOrder } from "./support/fixtures";

/**
 * Every page at phone, tablet and desktop widths: no console errors, no
 * horizontal overflow, no broken images.
 */
const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

async function audit(page: Page, path: string) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    // Next's dev-only performance.measure bug is not an application error.
    // The 404 page's own document status is expected, not an error.
    const expected404 = path === "/no-such-page" && /status of 404/.test(m.text());
    if (m.type() === "error" && !/negative time stamp/.test(m.text()) && !expected404) errors.push(m.text());
  };
  const onPageError = (e: Error) => errors.push(e.message);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  await page.goto(path, { waitUntil: "load" });
  // Let lazy images load.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    broken: [...document.images].filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0).map((img) => img.currentSrc),
  }));
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  return { errors, ...result };
}

test.describe("UI quality across breakpoints", () => {
  test.setTimeout(900_000);

  test("storefront, account and admin pages render cleanly", async ({ browser, request }) => {
    const list = (await (await request.get("/api/catalog/products?pageSize=1")).json()) as ProductListResponse;
    const slug = list.items[0]!.slug;
    const { api, phone } = await customerApi();
    const placed = await placeOrder(api, phone, "COD");
    const owner = await adminApi();

    const storefront = [
      "/",
      "/shop",
      "/shop/ikat",
      `/product/${slug}`,
      "/search?q=ikat",
      "/cart",
      "/track-order",
      "/support",
      "/about",
      "/contact",
      "/return-policy",
      "/no-such-page",
    ];
    const account = [
      "/account",
      "/account/orders",
      `/account/orders/${placed.orderNumber}`,
      "/account/addresses",
      "/account/wishlist",
      "/checkout",
    ];
    const admin = [
      "/admin",
      "/admin/orders",
      "/admin/cod",
      "/admin/products",
      "/admin/inventory",
      "/admin/returns",
      "/admin/coupons",
      "/admin/customers",
      "/admin/analytics",
      "/admin/audit-logs",
      "/admin/security",
    ];

    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      const guest = await browser.newContext({ viewport: vp });
      const customer = await browserAs(browser, api);
      const staff = await browser.newContext({ viewport: vp, storageState: await owner.storageState() });
      const sets: [Awaited<ReturnType<typeof browser.newContext>>, string[]][] = [
        [guest, storefront],
        [customer, account],
        [staff, admin],
      ];
      for (const [context, paths] of sets) {
        const page = await context.newPage();
        await page.setViewportSize({ width: vp.width, height: vp.height });
        for (const path of paths) {
          const r = await audit(page, path);
          const found = [
            ...(r.overflow > 1 ? [`${vp.name} ${path}: ${r.overflow}px horizontal overflow`] : []),
            ...(r.broken.length ? [`${vp.name} ${path}: broken images ${r.broken.slice(0, 2).join(", ")}`] : []),
            ...r.errors.map((e) => `${vp.name} ${path}: console error ${e.slice(0, 200)}`),
          ];
          for (const f of found) console.log("UI-PROBLEM", f);
          problems.push(...found);
        }
        await context.close();
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
    await Promise.all([api.dispose(), owner.dispose()]);
  });
});
