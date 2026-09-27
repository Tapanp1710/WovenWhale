import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../app-env";
import { productListQuerySchema } from "../../contracts/storefront";
import { readJson, readQuery, validate } from "../../lib/http";
import { getPublicStoreConfig } from "../settings/service";
import {
  getProductBySlug,
  homeFeed,
  listCategories,
  listProducts,
  productsByIds,
  relatedProducts,
  searchSuggestions,
  sitemapEntries,
} from "./service";

/** Public, cacheable catalog endpoints. */
export const catalogRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    await next();
    if (c.req.method === "GET" && c.res.status === 200) {
      c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    }
  })
  .get("/home", async (c) => c.json(await homeFeed()))
  .get("/config", async (c) => c.json(await getPublicStoreConfig()))
  .get("/categories", async (c) => c.json(await listCategories()))
  .get("/products", async (c) => c.json(await listProducts(readQuery(c, productListQuerySchema))))
  .get("/products/:slug", async (c) => c.json(await getProductBySlug(c.req.param("slug"))))
  .get("/products/:slug/related", async (c) => c.json(await relatedProducts(c.req.param("slug"))))
  .post("/products/by-ids", async (c) => {
    const { ids } = await readJson(c, z.object({ ids: z.array(z.uuid()).max(24) }));
    return c.json(await productsByIds(ids));
  })
  .get("/search/suggest", async (c) => {
    const { q } = validate(z.object({ q: z.string().trim().min(2).max(80) }), c.req.query());
    return c.json(await searchSuggestions(q));
  })
  .get("/sitemap", async (c) => c.json(await sitemapEntries()));
