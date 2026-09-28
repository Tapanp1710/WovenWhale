/**
 * Normalised catalog format produced by every import source (WooCommerce
 * Store API, Store API JSON dump, WooCommerce CSV export) and consumed by
 * `apply.ts`. Keeping one intermediate shape means the initial catalog can be
 * replaced by the official export without touching the database logic.
 */
export interface CatalogCategory {
  slug: string;
  name: string;
}

export interface CatalogVariant {
  size: string;
  sku: string | null;
  /** Known stock (CSV export). Null = unknown (Store API only exposes in/out of stock). */
  stock: number | null;
  sourceRef: string | null;
}

export interface CatalogProduct {
  sourceRef: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  categories: CatalogCategory[];
  tags: string[];
  mrpPaise: number;
  pricePaise: number;
  variants: CatalogVariant[];
  /** `url` is the original source; `localPath` is the WebP copy under frontend/public (npm run catalog:images). */
  images: { url: string; alt: string | null; width: number | null; height: number | null; localPath?: string }[];
  inStock: boolean;
}

export interface CatalogSnapshot {
  source: string;
  fetchedAt: string;
  products: CatalogProduct[];
}

/* ─────────────────────────────── Text helpers ────────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Converts WooCommerce HTML to plain text with paragraph breaks. The storefront
 * renders descriptions as text, so no third-party HTML ever reaches the DOM.
 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

const SMALL_WORDS = new Set(["for", "and", "of", "with", "the", "a", "in"]);

/** Fixes all-lowercase / ALL-CAPS legacy names without changing their words. */
export function tidyName(raw: string): string {
  const name = decodeEntities(raw).split(" | ")[0]!.replace(/\s+/g, " ").trim();
  return name
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/* ─────────────────────────── Attribute derivation ────────────────────────── */

const PATTERNS: [RegExp, string][] = [
  [/jamdani/i, "Jamdani"],
  [/kalamkari/i, "Kalamkari"],
  [/pattachitra/i, "Pattachitra"],
  [/jacquard/i, "Jacquard"],
  [/kantha/i, "Kantha"],
  [/mirror/i, "Mirror Work"],
  [/butta/i, "Butta"],
  [/paisley/i, "Paisley"],
  [/ikk?at/i, "Ikat"],
  [/stripe/i, "Stripes"],
  [/print/i, "Printed"],
  [/motif/i, "Motif"],
];

const COLORS: [RegExp, string][] = [
  [/\b(black|ebony|onyx)\b/i, "Black"],
  [/\b(white|snow)\b/i, "White"],
  [/\b(ivory|cream|off-?white)\b/i, "Ivory"],
  [/\b(grey|gray|slate|ash|granite|stone|charcoal|shadow)\b/i, "Grey"],
  [/\b(navy|midnight|indigo)\b/i, "Navy"],
  [/\b(blue|azure|sky|skyloom|mint|powder|neel|nilah|neer|blue ?jay)\b/i, "Blue"],
  [/\b(green|sage|emerald|olive)\b/i, "Green"],
  [/\b(maroon|rosewood|wine)\b/i, "Maroon"],
  [/\b(red|crimson|ruby|lohita|desire)\b/i, "Red"],
  [/\b(pink|blush|rose)\b/i, "Pink"],
  [/\b(mauve|lavender|purple)\b/i, "Mauve"],
  [/\b(peach|coral)\b/i, "Peach"],
  [/\b(mustard|yellow|gold|kanaka)\b/i, "Yellow"],
  [/\b(beige|sand|sandstone|khaki|taupe)\b/i, "Beige"],
  [/\b(brown|mocha|coffee|tan)\b/i, "Brown"],
];

export interface DerivedAttributes {
  productType: string;
  fabric: string;
  pattern: string;
  color: string | null;
}

/**
 * Structured attributes are not present in the WooCommerce data, so they are
 * derived from the product name, categories and tags. Admins can correct any
 * value in the dashboard; re-imports keep admin edits unless --overwrite.
 */
export function deriveAttributes(p: CatalogProduct): DerivedAttributes {
  const catText = p.categories.map((c) => c.slug).join(" ");
  const tagText = p.tags.join(" ");
  const descHead = (p.description ?? "").slice(0, 400);

  const productType = /kurt(h)?a/i.test(`${p.name} ${catText}`) ? "Kurta" : "Shirt";
  const fabric = /linen/i.test(`${p.name} ${catText}`) ? "Linen Blend" : "Cotton";
  const pattern =
    PATTERNS.find(([re]) => re.test(p.name))?.[1] ??
    PATTERNS.find(([re]) => re.test(catText))?.[1] ??
    PATTERNS.find(([re]) => re.test(descHead))?.[1] ??
    "Handwoven";
  const color = COLORS.find(([re]) => re.test(p.name))?.[1] ?? COLORS.find(([re]) => re.test(tagText.replace(/-/g, " ")))?.[1] ?? null;

  return { productType, fabric, pattern, color };
}

const SIZE_ALIASES: Record<string, string> = { SMALL: "S", MEDIUM: "M", LARGE: "L", "X-LARGE": "XL", "XX-LARGE": "XXL", "2XL": "XXL" };
export const normalizeSize = (s: string) => {
  const up = s.trim().toUpperCase();
  return SIZE_ALIASES[up] ?? up;
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}
