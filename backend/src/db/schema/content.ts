import { customType, index, integer, jsonb, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import type { PageSection } from "../../contracts/content";
import { createdAt, id } from "./_shared";
import { adminUsers } from "./identity";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/**
 * An editable storefront page. `draft` is what admins work on; `published` is
 * what customers see. Sections live in one validated JSON column so the
 * storefront reads a whole page in a single query.
 */
export const pages = pgTable("pages", {
  id: id(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 120 }).notNull(),
  draft: jsonb("draft").$type<PageSection[]>().notNull(),
  published: jsonb("published").$type<PageSection[]>(),
  publishedVersion: integer("published_version"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }).notNull().defaultNow(),
  draftUpdatedByAdminId: uuid("draft_updated_by_admin_id").references(() => adminUsers.id),
  createdAt: createdAt(),
});

/** Every publish is kept, so any earlier version can be previewed or restored into the draft. */
export const pageVersions = pgTable(
  "page_versions",
  {
    id: id(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    sections: jsonb("sections").$type<PageSection[]>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    publishedByAdminId: uuid("published_by_admin_id").references(() => adminUsers.id),
  },
  (t) => [unique("page_versions_page_version_uq").on(t.pageId, t.version)],
);

/** Images uploaded for the website (the media library). Stored as WebP. */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    provider: varchar("provider", { length: 16 }).notNull(),
    storageKey: varchar("storage_key", { length: 300 }).notNull().unique(),
    alt: varchar("alt", { length: 200 }).notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    originalName: varchar("original_name", { length: 200 }),
    createdByAdminId: uuid("created_by_admin_id").references(() => adminUsers.id),
    createdAt: createdAt(),
  },
  (t) => [index("media_assets_created_idx").on(t.createdAt)],
);

/**
 * File bytes for the "database" storage provider: durable uploads on hosts
 * whose disk is wiped on every deploy (Render's free plan), with no extra
 * service to configure.
 */
export const storedFiles = pgTable("stored_files", {
  key: varchar("key", { length: 300 }).primaryKey(),
  contentType: varchar("content_type", { length: 80 }).notNull(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});
