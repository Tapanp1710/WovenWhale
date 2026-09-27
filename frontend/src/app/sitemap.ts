import type { MetadataRoute } from "next";
import { publicApi } from "@/lib/api/server";
import { absolute } from "@/lib/seo";

const STATIC = [
  "/",
  "/shop",
  "/about",
  "/contact",
  "/support",
  "/returns",
  "/track-order",
  "/shipping-policy",
  "/return-policy",
  "/privacy",
  "/terms",
];

/** Sitemap generated from the live catalog (active products and navigable collections). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await publicApi<{ products: { slug: string; updatedAt: string }[]; categories: { slug: string; updatedAt: string }[] }>(
    "/catalog/sitemap",
    3600,
  ).catch(() => ({ products: [], categories: [] }));

  return [
    ...STATIC.map((path) => ({ url: absolute(path), changeFrequency: "weekly" as const, priority: path === "/" ? 1 : 0.5 })),
    ...data.categories.map((c) => ({
      url: absolute(`/shop/${c.slug}`),
      lastModified: c.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...data.products.map((p) => ({
      url: absolute(`/product/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
