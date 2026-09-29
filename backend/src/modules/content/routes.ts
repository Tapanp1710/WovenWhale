import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app-env";
import { mediaAltSchema, mediaQuerySchema, saveDraftSchema } from "../../contracts/content";
import { db } from "../../db/client";
import { storedFiles } from "../../db/schema";
import { HttpError, notFound, readJson, readQuery, validate } from "../../lib/http";
import { adminOf, requirePermission } from "../auth/middleware";
import {
  adminPage,
  assertEditablePage,
  deleteMedia,
  listMedia,
  listVersions,
  previewPage,
  publicPage,
  publish,
  restoreVersion,
  saveDraft,
  updateMediaAlt,
  uploadMedia,
} from "./service";

/** Storefront: the published page, with live catalogue data. */
export const contentRoutes = new Hono<AppEnv>().get("/pages/:slug", async (c) =>
  c.json(await publicPage(assertEditablePage(c.req.param("slug")))),
);

/** Files kept by the database storage provider. Keys are random, so responses can be cached forever. */
export const fileRoutes = new Hono<AppEnv>().get("/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/files\//, "");
  if (!/^[\w\-./]{1,300}$/.test(key) || key.includes("..")) throw notFound("File");
  const [file] = await db.select().from(storedFiles).where(eq(storedFiles.key, key));
  if (!file) throw notFound("File");
  c.header("Content-Type", file.contentType);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(Buffer.from(file.data));
});

const versionParam = z.coerce.number().int().min(1).max(100_000);

/** Website editor. Every route needs content.manage, checked here on the server. */
export const adminContentRoutes = new Hono<AppEnv>()
  .use(requirePermission("content.manage"))
  .get("/pages/:slug", async (c) => c.json(await adminPage(assertEditablePage(c.req.param("slug")))))
  .put("/pages/:slug/draft", async (c) => {
    const { sections } = await readJson(c, saveDraftSchema);
    return c.json(await saveDraft(adminOf(c), assertEditablePage(c.req.param("slug")), sections));
  })
  .post("/pages/:slug/publish", async (c) => c.json(await publish(adminOf(c), assertEditablePage(c.req.param("slug")))))
  .get("/pages/:slug/versions", async (c) => c.json(await listVersions(assertEditablePage(c.req.param("slug")))))
  .post("/pages/:slug/versions/:version/restore", async (c) =>
    c.json(await restoreVersion(adminOf(c), assertEditablePage(c.req.param("slug")), validate(versionParam, c.req.param("version")))),
  )
  /** ?version=draft (default) or a version number. */
  .get("/pages/:slug/preview", async (c) => {
    const raw = c.req.query("version") ?? "draft";
    const version = raw === "draft" ? "draft" : versionParam.safeParse(raw).data;
    if (!version) throw new HttpError(400, "INVALID_VERSION", "Unknown version.");
    return c.json(await previewPage(assertEditablePage(c.req.param("slug")), version));
  });

export const adminMediaRoutes = new Hono<AppEnv>()
  .use(requirePermission("content.manage"))
  .get("/", async (c) => c.json(await listMedia(readQuery(c, mediaQuerySchema))))
  .post("/", async (c) => {
    const body = await c.req.parseBody();
    if (!(body.file instanceof File)) throw new HttpError(400, "FILE_REQUIRED", "Choose an image to upload.");
    const alt = typeof body.alt === "string" ? body.alt.trim() : "";
    return c.json(await uploadMedia(adminOf(c), body.file, alt), 201);
  })
  .patch("/:id", async (c) => {
    const { alt } = await readJson(c, mediaAltSchema);
    return c.json(await updateMediaAlt(validate(z.uuid(), c.req.param("id")), alt));
  })
  .delete("/:id", async (c) => {
    await deleteMedia(adminOf(c), validate(z.uuid(), c.req.param("id")));
    return c.body(null, 204);
  });
