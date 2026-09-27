import { readFile } from "node:fs/promises";
import { decodeEntities, htmlToText, normalizeSize, type CatalogProduct, type CatalogSnapshot, type CatalogVariant } from "./normalize";

/* ───────────────────────── WooCommerce Store API (public) ────────────────── */

interface StoreApiProduct {
  id: number;
  name: string;
  slug: string;
  sku: string;
  type: string;
  short_description: string;
  description: string;
  prices: { regular_price: string; sale_price: string; price: string; currency_minor_unit: number };
  images: { src: string; alt: string; name: string }[];
  categories: { slug: string; name: string }[];
  tags: { slug: string; name: string }[];
  attributes: { name: string; terms: { name: string; slug: string }[] }[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
  is_in_stock: boolean;
}

function toMinor(value: string, minorUnit: number): number {
  // Store API returns integer strings in the currency's minor unit; INR uses 2 → paise.
  return Math.round(Number(value) * 10 ** (2 - minorUnit));
}

export function fromStoreApi(items: StoreApiProduct[]): CatalogProduct[] {
  return items.map((p) => {
    const sizeAttr = p.attributes.find((a) => /size/i.test(a.name));
    const sizes = [...new Set((sizeAttr?.terms ?? []).map((t) => normalizeSize(t.name)))];
    const regular = toMinor(p.prices.regular_price || p.prices.price, p.prices.currency_minor_unit);
    const sale = toMinor(p.prices.sale_price || p.prices.price, p.prices.currency_minor_unit);
    const sku = p.sku && p.sku !== "0" ? p.sku.trim() : null;
    const variants: CatalogVariant[] = (sizes.length ? sizes : ["FREE"]).map((size) => ({
      size,
      sku: null,
      stock: null,
      sourceRef: null,
    }));
    return {
      sourceRef: `woo:${p.id}`,
      name: decodeEntities(p.name),
      slug: p.slug,
      sku,
      shortDescription: htmlToText(p.short_description),
      description: htmlToText(p.description),
      categories: p.categories.filter((c) => c.slug !== "uncategorized").map((c) => ({ slug: c.slug, name: decodeEntities(c.name) })),
      tags: p.tags.map((t) => decodeEntities(t.name).toLowerCase()),
      mrpPaise: Math.max(regular, sale),
      pricePaise: Math.min(regular, sale),
      variants,
      images: p.images.map((img) => ({ url: img.src, alt: img.alt || null, width: null, height: null })),
      inStock: p.is_in_stock,
    };
  });
}

export async function fetchStoreApi(baseUrl: string): Promise<CatalogSnapshot> {
  const all: StoreApiProduct[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, {
      headers: { Accept: "application/json", "User-Agent": "WovenWhale-Catalog-Import/1.0" },
    });
    if (!res.ok) throw new Error(`Store API request failed (${res.status})`);
    const batch = (await res.json()) as StoreApiProduct[];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return { source: `store-api:${baseUrl}`, fetchedAt: new Date().toISOString(), products: fromStoreApi(all) };
}

export async function readStoreApiDump(path: string): Promise<CatalogSnapshot> {
  const items = JSON.parse(await readFile(path, "utf8")) as StoreApiProduct[];
  return { source: `store-api-dump:${path}`, fetchedAt: new Date().toISOString(), products: fromStoreApi(items) };
}

/* ─────────────────────── WooCommerce CSV product export ──────────────────── */

/** RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

const rupeesToPaise = (v: string) => Math.round(Number(v || 0) * 100);

/**
 * Reads the standard WooCommerce "Export products" CSV. Parent rows
 * (simple/variable) become products; `variation` rows become variants with
 * their real stock quantities.
 */
export async function readWooCsv(path: string): Promise<CatalogSnapshot> {
  const rows = parseCsv(await readFile(path, "utf8"));
  const parents = rows.filter((r) => r.Type === "variable" || r.Type === "simple");
  const variations = rows.filter((r) => r.Type === "variation");

  const products = parents.map<CatalogProduct>((r) => {
    const id = r.ID!;
    const sizeKey = Object.keys(r).find((k) => /^Attribute \d+ name$/.test(k) && /size/i.test(r[k]!));
    const sizeValues = sizeKey ? r[sizeKey.replace("name", "value(s)")]!.split(",").map((s) => normalizeSize(s)) : [];
    const ownVariations = variations.filter((v) => v.Parent === `id:${id}` || (r.SKU && v.Parent === r.SKU));
    const variants: CatalogVariant[] = ownVariations.length
      ? ownVariations.map((v) => {
          const vSizeKey = Object.keys(v).find((k) => /^Attribute \d+ name$/.test(k) && /size/i.test(v[k]!));
          return {
            size: normalizeSize(vSizeKey ? v[vSizeKey.replace("name", "value(s)")]! : "FREE"),
            sku: v.SKU || null,
            stock: v.Stock ? Number(v.Stock) : v["In stock?"] === "1" ? null : 0,
            sourceRef: `woo:${v.ID}`,
          };
        })
      : (sizeValues.length ? sizeValues : ["FREE"]).map((size) => ({
          size,
          sku: null,
          stock: r.Stock ? Number(r.Stock) : null,
          sourceRef: null,
        }));

    const variationPrices = ownVariations.map((v) => ({
      regular: rupeesToPaise(v["Regular price"]!),
      sale: rupeesToPaise(v["Sale price"] || v["Regular price"]!),
    }));
    const regular = variationPrices[0]?.regular || rupeesToPaise(r["Regular price"]!);
    const sale = variationPrices[0]?.sale || rupeesToPaise(r["Sale price"] || r["Regular price"]!);

    return {
      sourceRef: `woo:${id}`,
      name: decodeEntities(r.Name!),
      slug: r.Slug || "",
      sku: r.SKU || null,
      shortDescription: htmlToText(r["Short description"]),
      description: htmlToText(r.Description),
      categories: (r.Categories ?? "")
        .split(",")
        .map((path) => path.split(">").pop()!.trim())
        .filter(Boolean)
        .map((name) => ({
          slug: name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, ""),
          name,
        })),
      tags: (r.Tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      mrpPaise: Math.max(regular, sale),
      pricePaise: Math.min(regular, sale),
      variants,
      images: (r.Images ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean)
        .map((url) => ({ url, alt: null, width: null, height: null })),
      inStock: r["In stock?"] !== "0",
    };
  });

  return { source: `woo-csv:${path}`, fetchedAt: new Date().toISOString(), products };
}
