import { z } from "zod";
import type { CategoryDTO, ProductCardDTO } from "./dto";

/**
 * Website editor: a page is an ordered list of sections. Each section is a
 * known type with validated, plain-data settings — never code, markup or
 * styles. The storefront maps each type to an existing React component and
 * renders text as text, so nothing an admin enters can execute.
 */

export const SECTION_TYPES = [
  "hero",
  "categories",
  "products",
  "editorial",
  "promo",
  "story",
  "newsletter",
  "banner",
  "text",
  "gallery",
  "spacer",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Plain text: control characters removed, length capped (line breaks kept for paragraphs). */
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));
const required = (label: string, max: number) => text(max).pipe(z.string().min(1, `${label} is required`));

/** A same-site path ("/shop/ikat") or an https URL. Rules out javascript:, data: and protocol-relative links. */
export const linkHrefSchema = z
  .string()
  .trim()
  .max(300)
  .refine((v) => (/^\/(?!\/)[^\s<>"'\\]*$/.test(v) || /^https:\/\/[^\s<>"'\\]+$/.test(v)) && !v.includes(".."), {
    message: "Use a link that starts with / (for example /shop) or https://",
  });

/**
 * Images come from the storefront's own photos, the media library or Supabase
 * Storage — never an arbitrary third-party URL.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) =>
      !v.includes("..") &&
      (/^\/(catalog|brand|api\/files|api\/uploads)\/[\w\-./]+$/.test(v) ||
        /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[\w\-./]+$/.test(v)),
    { message: "Choose an image from the media library" },
  );

const cta = z.object({ label: required("Button text", 40), href: linkHrefSchema }).nullable();
const image = z.object({ url: imageUrlSchema, alt: text(160) });
const linkedImage = image.extend({ href: linkHrefSchema.nullable() });
const slug = z.string().regex(/^[a-z0-9-]{1,96}$/);

export const heroSettings = z.object({
  heading: required("Heading", 120),
  subtitle: text(300),
  primary: cta,
  secondary: cta,
  align: z.enum(["left", "center"]),
  /** Empty: photos of featured and new products, as the store has always done. */
  images: z.array(linkedImage).max(8),
});
export const categoriesSettings = z.object({
  title: required("Title", 80),
  link: cta,
  /** Empty: every collection with photos, in catalogue order. */
  categorySlugs: z.array(slug).max(12),
  limit: z.number().int().min(1).max(12),
});
export const PRODUCT_SOURCES = ["new", "best", "featured", "category", "selected"] as const;
export const productsSettings = z
  .object({
    title: required("Title", 80),
    intro: text(200),
    link: cta,
    source: z.enum(PRODUCT_SOURCES),
    categorySlug: slug.nullable(),
    productIds: z.array(z.uuid()).max(24),
    limit: z.number().int().min(1).max(12),
    columns: z.union([z.literal(3), z.literal(4)]),
  })
  .refine((s) => s.source !== "category" || s.categorySlug, { message: "Choose a collection", path: ["categorySlug"] })
  .refine((s) => s.source !== "selected" || s.productIds.length > 0, { message: "Choose at least one product", path: ["productIds"] });
export const editorialSettings = z.object({
  title: required("Title", 120),
  body: text(600),
  /** Null: a best seller with a photo. */
  productId: z.uuid().nullable(),
  items: z.array(z.object({ name: required("Name", 40), href: linkHrefSchema.nullable(), text: text(400) })).max(6),
});
export const promoSettings = z.object({
  title: required("Title", 80),
  /** {count} and {styles} are filled in from the collection. */
  text: text(300),
  /** When set, the section only shows while this collection exists. */
  categorySlug: slug.nullable(),
  link: cta,
});
export const storySettings = z.object({
  title: required("Title", 120),
  body: text(1200),
  link: cta,
  showReassurance: z.boolean(),
});
export const newsletterSettings = z.object({ title: required("Title", 120), text: text(300) });
export const bannerSettings = z.object({
  heading: required("Heading", 120),
  subtitle: text(300),
  image: image.nullable(),
  /** Used below 640px wide; the main image otherwise. */
  mobileImage: image.nullable(),
  cta,
  align: z.enum(["left", "center", "right"]),
  /** Darkening over the image, in percent, so light text stays readable. */
  overlay: z.number().int().min(0).max(80),
});
export const textSettings = z.object({ heading: text(120), body: text(2000), cta, align: z.enum(["left", "center"]) });
export const gallerySettings = z.object({ title: text(120), images: z.array(linkedImage).max(12) });
export const spacerSettings = z.object({ size: z.enum(["sm", "md", "lg"]) });

/** Section ids double as anchors on the page (e.g. /#weaves). */
const sectionId = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, "Invalid section id");
const section = <T extends SectionType, S extends z.ZodType>(type: T, settings: S) =>
  z.object({ id: sectionId, type: z.literal(type), hidden: z.boolean(), settings });

export const pageSectionSchema = z.discriminatedUnion("type", [
  section("hero", heroSettings),
  section("categories", categoriesSettings),
  section("products", productsSettings),
  section("editorial", editorialSettings),
  section("promo", promoSettings),
  section("story", storySettings),
  section("newsletter", newsletterSettings),
  section("banner", bannerSettings),
  section("text", textSettings),
  section("gallery", gallerySettings),
  section("spacer", spacerSettings),
]);
export type PageSection = z.infer<typeof pageSectionSchema>;
export type SectionOf<T extends SectionType> = Extract<PageSection, { type: T }>;

export const pageSectionsSchema = z
  .array(pageSectionSchema)
  .max(40, "A page can have up to 40 sections")
  .superRefine((sections, ctx) => {
    const seen = new Set<string>();
    sections.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Section ids must be unique" });
      seen.add(s.id);
    });
  });
export const saveDraftSchema = z.object({ sections: pageSectionsSchema });

export const EDITABLE_PAGES = { home: "Homepage" } as const;
export type EditablePage = keyof typeof EDITABLE_PAGES;

/** Settings for a section added from "Add section". */
export function defaultSettings<T extends SectionType>(type: T): SectionOf<T>["settings"] {
  const defaults: { [K in SectionType]: SectionOf<K>["settings"] } = {
    hero: { heading: "A new heading", subtitle: "", primary: { label: "Shop now", href: "/shop" }, secondary: null, align: "left", images: [] },
    categories: { title: "Shop by weave", link: null, categorySlugs: [], limit: 8 },
    products: {
      title: "New on the loom",
      intro: "",
      link: null,
      source: "new",
      categorySlug: null,
      productIds: [],
      limit: 4,
      columns: 4,
    },
    editorial: { title: "A story about the craft", body: "", productId: null, items: [] },
    promo: { title: "Something special", text: "", categorySlug: null, link: { label: "Shop now", href: "/shop" } },
    story: { title: "Our story", body: "", link: null, showReassurance: false },
    newsletter: { title: "Hear about new weaves first", text: "One email when a new collection comes off the loom." },
    banner: { heading: "A new banner", subtitle: "", image: null, mobileImage: null, cta: { label: "Shop now", href: "/shop" }, align: "left", overlay: 30 },
    text: { heading: "A new heading", body: "", cta: null, align: "left" },
    gallery: { title: "", images: [] },
    spacer: { size: "md" },
  };
  return defaults[type] as SectionOf<T>["settings"];
}

/**
 * The homepage as it was built by hand, expressed as sections: the first
 * published version, so customers see no change when the editor arrives.
 */
export const DEFAULT_HOME_SECTIONS: PageSection[] = [
  {
    id: "hero",
    type: "hero",
    hidden: false,
    settings: {
      heading: "Shirts woven thread by thread on Indian handlooms",
      subtitle: "Ikat, jamdani and kalamkari, cut into shirts and kurtas you'll reach for every week.",
      primary: { label: "Shop new arrivals", href: "/shop/new-arrivals" },
      secondary: { label: "Browse everything", href: "/shop" },
      align: "left",
      images: [],
    },
  },
  {
    id: "weaves",
    type: "categories",
    hidden: false,
    settings: { title: "Shop by weave", link: { label: "See every style", href: "/shop" }, categorySlugs: [], limit: 8 },
  },
  {
    id: "new",
    type: "products",
    hidden: false,
    settings: {
      title: "New on the loom",
      intro: "The latest handwoven pieces, in limited runs.",
      link: { label: "All new arrivals", href: "/shop/new-arrivals" },
      source: "new",
      categorySlug: null,
      productIds: [],
      limit: 8,
      columns: 4,
    },
  },
  {
    id: "loom",
    type: "editorial",
    hidden: false,
    settings: {
      title: "No two pieces come off the loom quite the same",
      body: "Slight shifts in colour and weave are how you know a person, not a machine, made the cloth. Here's what goes into the three techniques you'll find most often in our collection.",
      productId: null,
      items: [
        {
          name: "Ikat",
          href: "/shop/ikat",
          text: "The threads are tie-dyed before they ever reach the loom. When the weaver lines them up, the pattern appears with the soft, feathered edges ikat is known for.",
        },
        {
          name: "Jamdani",
          href: "/shop/jamdani",
          text: "Motifs are inlaid by hand, one extra weft thread at a time, while the base cloth is woven. It is slow work, and it shows in the fine raised detail.",
        },
        {
          name: "Kalamkari",
          href: "/shop/kalamkari",
          text: "Patterns are drawn or block-printed onto cotton, giving each shirt its artisan-printed motifs and the slight variation of a hand process.",
        },
      ],
    },
  },
  {
    id: "best",
    type: "products",
    hidden: false,
    settings: {
      title: "Most loved",
      intro: "The styles customers come back for.",
      link: { label: "Shop best sellers", href: "/shop?sort=best-selling" },
      source: "best",
      categorySlug: null,
      productIds: [],
      limit: 4,
      columns: 4,
    },
  },
  {
    id: "clearance",
    type: "promo",
    hidden: false,
    settings: {
      title: "Clearance",
      text: "{count} past-season {styles} at reduced prices, while sizes last.",
      categorySlug: "sale",
      link: { label: "Shop clearance", href: "/shop/sale" },
    },
  },
  {
    id: "featured",
    type: "products",
    hidden: false,
    settings: {
      title: "Picked for the season",
      intro: "",
      link: { label: "Shop all", href: "/shop" },
      source: "featured",
      categorySlug: null,
      productIds: [],
      limit: 4,
      columns: 4,
    },
  },
  {
    id: "story",
    type: "story",
    hidden: false,
    settings: {
      title: "Made slowly, on purpose",
      body: "WovenWhale works with handloom weavers to turn traditional textiles into shirts and kurtas cut for the way you dress now. Fewer pieces, made with care, meant to be worn for years.",
      link: { label: "Read our story", href: "/about" },
      showReassurance: true,
    },
  },
  {
    id: "newsletter",
    type: "newsletter",
    hidden: false,
    settings: {
      title: "Hear about new weaves first",
      text: "One email when a new collection comes off the loom. No spam, unsubscribe anytime.",
    },
  },
];

/* ─────────────────────────────── API shapes ─────────────────────────────── */

export interface ContentImageDTO {
  src: string;
  alt: string;
  href: string | null;
  /** Accessible name of the link (product name for automatic hero photos). */
  label: string;
}

/**
 * A section ready to render: settings plus the live catalogue data it shows.
 * Prices, stock and product photos always come from the catalogue.
 */
export type ResolvedSection = PageSection & {
  strips?: ContentImageDTO[];
  products?: ProductCardDTO[];
  product?: ProductCardDTO | null;
  categories?: (CategoryDTO & { coverImageUrl: string | null })[];
  count?: number | null;
};

export interface PublicPageDTO {
  slug: string;
  version: number | null;
  sections: ResolvedSection[];
}

export interface AdminPageDTO {
  slug: EditablePage;
  title: string;
  draft: PageSection[];
  draftUpdatedAt: string;
  draftUpdatedBy: string | null;
  publishedVersion: number | null;
  publishedAt: string | null;
  /** The draft differs from what customers see. */
  unpublishedChanges: boolean;
  /** Names of the products the draft picks by hand, for the editor. */
  productNames: Record<string, string>;
}

export interface PageVersionDTO {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  sectionCount: number;
  live: boolean;
}

export interface MediaAssetDTO {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  bytes: number;
  originalName: string | null;
  createdAt: string;
  /** Used by a draft, the live page or a saved version: can't be deleted. */
  inUse: boolean;
}

export const mediaAltSchema = z.object({ alt: text(200) });
export const mediaQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(30),
});
