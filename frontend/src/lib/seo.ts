import { SITE_URL } from "./format";

export const absolute = (path: string) => new URL(path, SITE_URL).toString();

/** schema.org BreadcrumbList for rich results. */
export function breadcrumbJsonLd(items: { href: string; label: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.label, item: absolute(item.href) })),
  };
}

/** Serialises JSON-LD safely for inline <script> (escapes "<" to prevent tag injection). */
export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
