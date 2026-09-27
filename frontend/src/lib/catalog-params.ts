import type { ProductSort } from "@wovenwhale/backend/contracts";

/** Query keys the storefront URL shares with the catalog API: /shop?category=ikat&size=L&sort=price-low */
export const MULTI_KEYS = ["size", "color", "fabric", "pattern", "type"] as const;
export const SINGLE_KEYS = ["minPrice", "maxPrice", "availability", "discount", "sort", "page", "q"] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "best-selling", label: "Best selling" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
  { value: "name", label: "Name: A to Z" },
];

export const DISCOUNT_OPTIONS = [20, 30, 40, 50];

export const PRICE_BUCKETS: { label: string; min?: number; max?: number }[] = [
  { label: "Under ₹1,000", max: 999 },
  { label: "₹1,000 to ₹1,299", min: 1000, max: 1299 },
  { label: "₹1,300 and above", min: 1300 },
];

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Whitelists and normalises page search params into the API query string. */
export function toApiQuery(params: SearchParams, extra: Record<string, string> = {}): string {
  const out = new URLSearchParams();
  for (const key of [...MULTI_KEYS, ...SINGLE_KEYS]) {
    const value = first(params[key]);
    if (value) out.set(key, value.slice(0, 200));
  }
  for (const [k, v] of Object.entries(extra)) out.set(k, v);
  if (!out.has("pageSize")) out.set("pageSize", "24");
  return out.toString();
}

export function activeFilterCount(params: URLSearchParams): number {
  let n = 0;
  for (const k of MULTI_KEYS) n += params.get(k)?.split(",").filter(Boolean).length ?? 0;
  if (params.get("minPrice") || params.get("maxPrice")) n++;
  if (params.get("availability")) n++;
  if (params.get("discount")) n++;
  return n;
}
