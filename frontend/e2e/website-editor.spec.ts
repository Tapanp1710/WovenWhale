import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import type { AdminPageDTO, PageVersionDTO } from "@wovenwhale/backend/contracts";
import sharp from "sharp";
import { BASE_URL, adminApi } from "./support/fixtures";

const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "Demo-Only-2026!";
const ORIGINAL_HEADING = "Shirts woven thread by thread on Indian handlooms";

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return res.status() === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Position of one section relative to another on the public page (true: `first` comes before `second`). */
const comesBefore = (page: Page, first: string, second: string) =>
  page.evaluate(
    ([a, b]) => Boolean(document.getElementById(a!)!.compareDocumentPosition(document.getElementById(b!)!) & Node.DOCUMENT_POSITION_FOLLOWING),
    [first, second],
  );

async function publicHome(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.goto("/");
  return { page, close: () => ctx.close() };
}

test.describe("website editor", () => {
  test("edit, save a draft, preview, publish, then roll back — the public homepage follows only publishes", async ({ browser }) => {
    test.setTimeout(240_000);
    const owner = await adminApi();
    await ok(await owner.get("/api/admin/content/pages/home")); // creates the page on first use
    const before = await ok<PageVersionDTO[]>(await owner.get("/api/admin/content/pages/home/versions"));
    const liveBefore = before.find((v) => v.live)!.version;
    // Start with the draft equal to the live page, so the test is repeatable.
    await ok(await owner.post(`/api/admin/content/pages/home/versions/${liveBefore}/restore`));
    const liveSections = (await ok<{ sections: { id: string; settings: { heading?: string } }[] }>(await owner.get("/api/content/pages/home"))).sections;
    const liveHeading = liveSections[0]!.settings.heading!;

    const staff = await browser.newContext({ storageState: await owner.storageState(), baseURL: BASE_URL });
    const editor = await staff.newPage();
    await editor.goto("/admin/website");
    await expect(editor.getByRole("heading", { name: "Website editor" })).toBeVisible();
    const preview = editor.frameLocator('iframe[title="Draft preview"]');
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText(liveHeading);

    // Move "Shop by weave" below "New on the loom".
    await editor.getByRole("button", { name: "Move Shop by weave down" }).click();

    // Change the hero text and add an uploaded photo as the first strip.
    const heading = `Handlooms, rewoven ${Date.now()}`;
    await editor.getByRole("button", { name: /^Edit Hero:/ }).click();
    await editor.getByLabel("Heading").fill(heading);
    await editor.getByRole("button", { name: "Add image" }).click();
    const png = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#1f3a5f" } })
      .png()
      .toBuffer();
    await editor.getByTestId("media-picker-upload").setInputFiles({ name: "e2e-hero.png", mimeType: "image/png", buffer: png });
    await expect(editor.getByLabel("Alt text, image 1")).toBeVisible();
    await editor.getByLabel("Alt text, image 1").fill("Indigo handloom cloth");

    // Save the draft: the preview shows it, customers don't.
    await editor.getByRole("button", { name: "Save draft" }).click();
    await expect(editor.getByText("Draft saved")).toBeVisible();
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText(heading);
    const draftPreview = await staff.newPage();
    await draftPreview.goto("/preview");
    await expect(draftPreview.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(draftPreview.getByRole("status")).toContainText("Preview of the draft");

    const visitor = await publicHome(browser);
    await expect(visitor.page.getByRole("heading", { level: 1 })).toHaveText(liveHeading);
    expect(await comesBefore(visitor.page, "weaves", "new")).toBe(true);
    // The preview itself is not public.
    await visitor.page.goto("/preview");
    await expect(visitor.page).toHaveURL(/\/admin\/login/);
    await visitor.close();

    // Publish: the homepage changes, no deploy involved.
    await editor.getByRole("button", { name: "Publish", exact: true }).click();
    await editor.getByRole("dialog", { name: "Publish website changes?" }).getByRole("button", { name: "Publish" }).click();
    await expect(editor.getByText(/Version \d+ is live on the website/)).toBeVisible();

    const published = await publicHome(browser);
    await expect(published.page.getByRole("heading", { level: 1 })).toHaveText(heading);
    expect(await comesBefore(published.page, "new", "weaves")).toBe(true);
    const firstStrip = published.page.getByRole("list", { name: "Featured pieces" }).locator("img").first();
    await expect(firstStrip).toHaveAttribute("src", /media%2F/);
    await published.close();

    // Roll back: restore the earlier version into the draft, then publish it.
    await editor.getByRole("button", { name: "Versions" }).click();
    const row = editor.getByRole("listitem").filter({ hasText: new RegExp(`Version ${liveBefore}(?!\\d)`) }).first();
    await row.getByRole("button", { name: "Restore" }).click();
    await editor.getByRole("dialog", { name: `Restore version ${liveBefore} into the draft?` }).getByRole("button", { name: "Restore to draft" }).click();
    await expect(editor.getByText(`Version ${liveBefore} is in the draft`)).toBeVisible();
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText(liveHeading);
    await editor.getByRole("button", { name: "Publish", exact: true }).click();
    await editor.getByRole("dialog", { name: "Publish website changes?" }).getByRole("button", { name: "Publish" }).click();
    await expect(editor.getByText(/Version \d+ is live on the website/)).toBeVisible();

    const rolledBack = await publicHome(browser);
    await expect(rolledBack.page.getByRole("heading", { level: 1 })).toHaveText(liveHeading);
    expect(await comesBefore(rolledBack.page, "weaves", "new")).toBe(true);
    await rolledBack.close();

    // Every step is in the audit trail.
    const audit = await ok<{ items: { action: string }[] }>(await owner.get("/api/admin/audit-logs?entityType=page&entityId=home&pageSize=100"));
    expect(audit.items.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "content.draft_saved",
        "content.section_moved",
        "content.section_updated",
        "content.page_published",
        "content.version_restored",
      ]),
    );
    const media = await ok<{ items: { action: string }[] }>(await owner.get("/api/admin/audit-logs?entityType=media&pageSize=20"));
    expect(media.items.map((a) => a.action)).toContain("content.media_uploaded");
    await Promise.all([owner.dispose(), staff.close()]);
  });

  test("hide, show, add, duplicate and remove sections; bad links are refused", async () => {
    const owner = await adminApi();
    const page = await ok<AdminPageDTO>(await owner.get("/api/admin/content/pages/home"));
    const original = page.draft;
    try {
      const withBanner = [
        ...original.map((s) => (s.id === "clearance" ? { ...s, hidden: true } : s)),
        {
          id: "banner-e2e",
          type: "banner",
          hidden: false,
          settings: { heading: "E2E banner", subtitle: "", image: null, mobileImage: null, cta: null, align: "center", overlay: 20 },
        },
      ];
      const saved = await ok<AdminPageDTO>(await owner.put("/api/admin/content/pages/home/draft", { data: { sections: withBanner } }));
      expect(saved.draft.find((s) => s.id === "clearance")!.hidden).toBe(true);

      const preview = await ok<{ sections: { id: string }[] }>(await owner.get("/api/admin/content/pages/home/preview?version=draft"));
      const ids = preview.sections.map((s) => s.id);
      expect(ids).toContain("banner-e2e");
      expect(ids).not.toContain("clearance"); // hidden sections stay in the editor, not on the page

      const bad = await owner.put("/api/admin/content/pages/home/draft", {
        data: { sections: [{ ...withBanner.at(-1)!, settings: { ...withBanner.at(-1)!.settings, cta: { label: "Go", href: "javascript:alert(1)" } } }] },
      });
      expect(bad.status()).toBe(400);
      const script = await owner.put("/api/admin/content/pages/home/draft", {
        data: { sections: [{ id: "x1", type: "html", hidden: false, settings: { html: "<script>alert(1)</script>" } }] },
      });
      expect(script.status()).toBe(400);

      const audit = await ok<{ items: { action: string }[] }>(await owner.get("/api/admin/audit-logs?entityType=page&entityId=home&pageSize=20"));
      expect(audit.items.map((a) => a.action)).toEqual(expect.arrayContaining(["content.section_added", "content.section_hidden"]));
    } finally {
      await ok(await owner.put("/api/admin/content/pages/home/draft", { data: { sections: original } }));
      await owner.dispose();
    }
  });

  test("media library: validated uploads, images in use can't be deleted, unused ones can", async () => {
    const owner = await adminApi();
    const fake = await owner.post("/api/admin/media", {
      multipart: { file: { name: "not-an-image.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } },
    });
    expect(fake.status()).toBe(415);

    const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#aa3322" } })
      .png()
      .toBuffer();
    const asset = await ok<{ id: string; url: string; inUse: boolean }>(
      await owner.post("/api/admin/media", { multipart: { file: { name: "spare.png", mimeType: "image/png", buffer: png }, alt: "Spare swatch" } }),
    );
    expect(asset.url).toMatch(/\.webp$/);
    const served = await owner.get(asset.url);
    expect(served.headers()["content-type"]).toBe("image/webp");
    await ok(await owner.patch(`/api/admin/media/${asset.id}`, { data: { alt: "Red swatch" } }));
    const found = await ok<{ items: { id: string; alt: string }[] }>(await owner.get("/api/admin/media?q=Red%20swatch"));
    expect(found.items.map((i) => i.id)).toContain(asset.id);
    expect((await owner.delete(`/api/admin/media/${asset.id}`)).status()).toBe(204);
    await owner.dispose();
  });

  test("only admins with website access can edit, preview or publish", async ({ browser }) => {
    const support = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
    await ok(await support.post("/api/admin/auth/login", { data: { email: "support@wovenwhale.local", password: DEMO_PASSWORD } }));
    const owner = await adminApi();
    const draft = (await ok<AdminPageDTO>(await owner.get("/api/admin/content/pages/home"))).draft;
    expect((await support.get("/api/admin/content/pages/home")).status()).toBe(403);
    expect((await support.put("/api/admin/content/pages/home/draft", { data: { sections: draft } })).status()).toBe(403);
    expect((await support.post("/api/admin/content/pages/home/publish")).status()).toBe(403);
    expect((await support.get("/api/admin/content/pages/home/preview")).status()).toBe(403);
    expect((await support.get("/api/admin/media")).status()).toBe(403);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
    expect((await anonymous.get("/api/admin/content/pages/home/preview")).status()).toBe(401);

    const ctx = await browser.newContext({ storageState: await support.storageState(), baseURL: BASE_URL });
    const page = await ctx.newPage();
    await page.goto("/admin/website");
    await expect(page.getByText("Your role can't view the website editor.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Website editor" })).toHaveCount(0);
    await Promise.all([support.dispose(), owner.dispose(), anonymous.dispose(), ctx.close()]);
  });
});
