import type { CategoryDTO } from "@wovenwhale/backend/contracts";

export interface NavLink {
  href: string;
  label: string;
}

export interface Navigation {
  primary: NavLink[];
  weaves: NavLink[];
}

/** Garment types lead; techniques (weaves) group together; clearance sits last. */
const GARMENTS = ["new-arrivals", "shirts", "kurthas"];
const CLEARANCE = "sale";

export function buildNavigation(categories: CategoryDTO[]): Navigation {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const link = (c: CategoryDTO): NavLink => ({ href: `/shop/${c.slug}`, label: c.name });
  const primary = GARMENTS.map((s) => bySlug.get(s))
    .filter((c): c is CategoryDTO => Boolean(c))
    .map(link);
  const weaves = categories.filter((c) => !GARMENTS.includes(c.slug) && c.slug !== CLEARANCE).map(link);
  const clearance = bySlug.get(CLEARANCE);
  return { primary: clearance ? [...primary, link(clearance)] : primary, weaves };
}
