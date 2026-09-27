import type { MetadataRoute } from "next";
import { absolute } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private, transactional and API surfaces are never indexed.
        disallow: ["/admin", "/api/", "/account", "/checkout", "/cart", "/search"],
      },
    ],
    sitemap: absolute("/sitemap.xml"),
  };
}
