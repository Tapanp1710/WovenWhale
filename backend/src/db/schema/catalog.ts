import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAt, deletedAt, id, updatedAt } from "./_shared";

export const categories = pgTable(
  "categories",
  {
    id: id(),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    /** Shown in storefront navigation when true. */
    isNavigable: boolean("is_navigable").notNull().default(true),
    seoTitle: varchar("seo_title", { length: 160 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug)],
);

/**
 * Products. Money is stored as integer paise (₹1 = 100) — never floating point.
 * `discount_percent` is a generated column so the storefront can filter and
 * sort by discount at the database layer.
 */
export const products = pgTable(
  "products",
  {
    id: id(),
    slug: varchar("slug", { length: 160 }).notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    productType: varchar("product_type", { length: 48 }).notNull(),
    fabric: varchar("fabric", { length: 64 }),
    pattern: varchar("pattern", { length: 64 }),
    color: varchar("color", { length: 48 }),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mrpPaise: integer("mrp_paise").notNull(),
    pricePaise: integer("price_paise").notNull(),
    discountPercent: integer("discount_percent").generatedAlwaysAs(
      sql`case when mrp_paise > 0 then floor(((mrp_paise - price_paise) * 100)::numeric / mrp_paise)::int else 0 end`,
    ),
    isFeatured: boolean("is_featured").notNull().default(false),
    isBestSeller: boolean("is_best_seller").notNull().default(false),
    isNewArrival: boolean("is_new_arrival").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id),
    seoTitle: varchar("seo_title", { length: 160 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    /** Identifier in the source system (e.g. WooCommerce product id) for idempotent imports. */
    sourceRef: varchar("source_ref", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("products_slug_uq").on(t.slug),
    uniqueIndex("products_sku_uq").on(t.sku),
    uniqueIndex("products_source_ref_uq").on(t.sourceRef),
    index("products_active_idx").on(t.isActive, t.deletedAt),
    index("products_price_idx").on(t.pricePaise),
    index("products_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.name} || ' ' || coalesce(${t.fabric}, '') || ' ' || coalesce(${t.pattern}, '') || ' ' || coalesce(${t.color}, '') || ' ' || ${t.productType})`,
    ),
    check("products_price_ck", sql`${t.pricePaise} > 0 and ${t.mrpPaise} >= ${t.pricePaise}`),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] }), index("product_categories_cat_idx").on(t.categoryId)],
);

/** Purchasable unit. Stock lives on the variant (see `inventory`). */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 64 }).notNull(),
    size: varchar("size", { length: 16 }).notNull(),
    color: varchar("color", { length: 48 }),
    /** Optional per-variant price overrides; null = inherit product price. */
    pricePaise: integer("price_paise"),
    mrpPaise: integer("mrp_paise"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sourceRef: varchar("source_ref", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("product_variants_sku_uq").on(t.sku),
    unique("product_variants_product_size_color_uq").on(t.productId, t.size, t.color).nullsNotDistinct(),
    index("product_variants_size_idx").on(t.size),
  ],
);

/**
 * Image references. The UI never builds image URLs itself — the storage
 * layer resolves (`provider`, `storageKey`) into a public URL, so assets can
 * move from the legacy WooCommerce server to Supabase Storage / S3 /
 * Cloudinary without UI changes.
 */
export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    storageKey: text("storage_key").notNull(),
    alt: varchar("alt", { length: 200 }),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
);
