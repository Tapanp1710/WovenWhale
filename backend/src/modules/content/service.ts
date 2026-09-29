import { and, desc, eq, ilike, inArray, max, or, sql } from "drizzle-orm";
import {
  DEFAULT_HOME_SECTIONS,
  EDITABLE_PAGES,
  pageSectionsSchema,
  type AdminPageDTO,
  type ContentImageDTO,
  type EditablePage,
  type MediaAssetDTO,
  type PageSection,
  type PageVersionDTO,
  type PublicPageDTO,
  type ResolvedSection,
} from "../../contracts/content";
import { productListQuerySchema } from "../../contracts/storefront";
import type { AdminContext } from "../../app-env";
import { db } from "../../db/client";
import { adminUsers, mediaAssets, pages, pageVersions, products } from "../../db/schema";
import { diffSections, hasChanges, type SectionChanges } from "../../domain/content";
import { DomainError } from "../../domain/errors";
import { providers } from "../../integrations";
import { resolveImageUrl } from "../../integrations/storage";
import { recordAudit } from "../../lib/audit";
import { randomToken } from "../../lib/crypto";
import { HttpError, notFound } from "../../lib/http";
import { MAX_IMAGE_BYTES, sniffImage, toWebp } from "../../lib/images";
import { loadProductCards } from "../catalog/cards";
import { homeFeed, listProducts } from "../catalog/service";

type Admin = Pick<AdminContext, "id" | "email">;

const DEFAULTS: Record<EditablePage, PageSection[]> = { home: DEFAULT_HOME_SECTIONS };

export function assertEditablePage(slug: string): EditablePage {
  if (!(slug in EDITABLE_PAGES)) throw notFound("Page");
  return slug as EditablePage;
}

/**
 * The page row, created on first use from the hand-built layout, which becomes
 * version 1: live and in the draft, so nothing changes for customers.
 */
async function ensurePage(slug: EditablePage) {
  const [existing] = await db.select().from(pages).where(eq(pages.slug, slug));
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const sections = DEFAULTS[slug];
    const [page] = await tx
      .insert(pages)
      .values({ slug, title: EDITABLE_PAGES[slug], draft: sections, published: sections, publishedVersion: 1, publishedAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (!page) return (await tx.select().from(pages).where(eq(pages.slug, slug)))[0]!; // created concurrently
    await tx.insert(pageVersions).values({ pageId: page.id, version: 1, sections });
    return page;
  });
}

/* ───────────────────────────── Rendering data ───────────────────────────── */

/**
 * Attaches live catalogue data to each visible section in a fixed number of
 * queries: one home feed, one card load for hand-picked products, one listing
 * per collection-based product section.
 */
export async function resolveSections(all: PageSection[]): Promise<ResolvedSection[]> {
  const sections = all.filter((s) => !s.hidden);
  const needsFeed = sections.some(
    (s) =>
      (s.type === "hero" && s.settings.images.length === 0) ||
      s.type === "categories" ||
      s.type === "promo" ||
      (s.type === "editorial" && !s.settings.productId) ||
      (s.type === "products" && ["new", "best", "featured"].includes(s.settings.source)),
  );
  const pickedIds = [
    ...new Set(
      sections.flatMap((s) =>
        s.type === "products" && s.settings.source === "selected"
          ? s.settings.productIds
          : s.type === "editorial" && s.settings.productId
            ? [s.settings.productId]
            : [],
      ),
    ),
  ];
  const categorySections = sections.filter(
    (s): s is Extract<PageSection, { type: "products" }> => s.type === "products" && s.settings.source === "category",
  );

  const [feed, picked, listings] = await Promise.all([
    needsFeed ? homeFeed() : null,
    loadProductCards(pickedIds),
    Promise.all(
      categorySections.map((s) =>
        listProducts(productListQuerySchema.parse({ category: s.settings.categorySlug, pageSize: s.settings.limit })).catch(() => null),
      ),
    ),
  ]);
  const pickedById = new Map(picked.map((p) => [p.id, p]));
  const listingBySection = new Map(categorySections.map((s, i) => [s.id, listings[i]?.items ?? []]));

  const out: ResolvedSection[] = [];
  for (const s of sections) {
    switch (s.type) {
      case "hero": {
        let strips: ContentImageDTO[];
        if (s.settings.images.length) {
          strips = s.settings.images.map((i) => ({ src: i.url, alt: i.alt, href: i.href, label: i.alt || s.settings.heading }));
        } else {
          // Second (detail) shots of featured and new pieces read best as narrow threads.
          const products = [...feed!.featured, ...feed!.newArrivals].filter((p, i, list) => list.findIndex((x) => x.id === p.id) === i);
          strips = products.slice(0, 6).flatMap((p) => {
            const img = p.images[1] ?? p.images[0];
            return img ? [{ src: img.url, alt: img.alt, href: `/product/${p.slug}`, label: p.name }] : [];
          });
        }
        out.push({ ...s, strips });
        break;
      }
      case "categories": {
        const withCover = feed!.categories.filter((c) => c.coverImageUrl);
        const chosen = s.settings.categorySlugs.length
          ? s.settings.categorySlugs.flatMap((slug) => withCover.filter((c) => c.slug === slug))
          : withCover.filter((c) => c.slug !== "new-arrivals");
        out.push({ ...s, categories: chosen.slice(0, s.settings.limit) });
        break;
      }
      case "products": {
        const { source, limit, productIds } = s.settings;
        const products =
          source === "new"
            ? feed!.newArrivals
            : source === "best"
              ? feed!.bestSellers
              : source === "featured"
                ? feed!.featured
                : source === "category"
                  ? (listingBySection.get(s.id) ?? [])
                  : productIds.flatMap((id) => pickedById.get(id) ?? []);
        out.push({ ...s, products: products.slice(0, limit) });
        break;
      }
      case "editorial": {
        const product = s.settings.productId
          ? (pickedById.get(s.settings.productId) ?? null)
          : ([...feed!.bestSellers, ...feed!.featured].find((p) => p.images[0]) ?? null);
        out.push({ ...s, product });
        break;
      }
      case "promo": {
        const category = s.settings.categorySlug ? feed!.categories.find((c) => c.slug === s.settings.categorySlug) : null;
        if (s.settings.categorySlug && !category) break; // the collection is gone: so is its promotion
        out.push({ ...s, count: category?.productCount ?? null });
        break;
      }
      default:
        out.push(s);
    }
  }
  return out;
}

/** What customers see: the published sections, resolved (the built-in layout until the first save). */
export async function publicPage(slug: EditablePage): Promise<PublicPageDTO> {
  const [row] = await db
    .select({ published: pages.published, version: pages.publishedVersion })
    .from(pages)
    .where(eq(pages.slug, slug));
  return { slug, version: row?.version ?? null, sections: await resolveSections(row?.published ?? DEFAULTS[slug]) };
}

/** Admin-only preview of the draft or of a saved version, rendered exactly as customers would see it. */
export async function previewPage(slug: EditablePage, version: "draft" | number): Promise<PublicPageDTO> {
  const page = await ensurePage(slug);
  if (version === "draft") return { slug, version: null, sections: await resolveSections(page.draft) };
  const [row] = await db
    .select({ sections: pageVersions.sections })
    .from(pageVersions)
    .where(and(eq(pageVersions.pageId, page.id), eq(pageVersions.version, version)));
  if (!row) throw notFound("Version");
  return { slug, version, sections: await resolveSections(row.sections) };
}

/* ─────────────────────────────── Editing ─────────────────────────────── */

export async function adminPage(slug: EditablePage): Promise<AdminPageDTO> {
  const page = await ensurePage(slug);
  const ids = page.draft.flatMap((s) =>
    s.type === "products" ? s.settings.productIds : s.type === "editorial" && s.settings.productId ? [s.settings.productId] : [],
  );
  const [[editor], named] = await Promise.all([
    page.draftUpdatedByAdminId
      ? db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.id, page.draftUpdatedByAdminId))
      : Promise.resolve([]),
    ids.length ? db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, ids)) : Promise.resolve([]),
  ]);
  return {
    slug,
    title: page.title,
    draft: page.draft,
    draftUpdatedAt: page.draftUpdatedAt.toISOString(),
    draftUpdatedBy: editor?.email ?? null,
    publishedVersion: page.publishedVersion,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    unpublishedChanges: JSON.stringify(page.draft) !== JSON.stringify(page.published),
    productNames: Object.fromEntries(named.map((p) => [p.id, p.name])),
  };
}

const CHANGE_ACTIONS: Record<keyof SectionChanges, string> = {
  added: "content.section_added",
  removed: "content.section_deleted",
  moved: "content.section_moved",
  hidden: "content.section_hidden",
  shown: "content.section_shown",
  updated: "content.section_updated",
};

/** Saves the draft (never touches the live page) and records each kind of change. */
export async function saveDraft(admin: Admin, slug: EditablePage, sections: PageSection[]) {
  await ensurePage(slug);
  await db.transaction(async (tx) => {
    const [page] = await tx.select().from(pages).where(eq(pages.slug, slug)).for("update");
    const changes = diffSections(page!.draft, sections);
    if (!hasChanges(changes)) return;
    await tx
      .update(pages)
      .set({ draft: sections, draftUpdatedAt: new Date(), draftUpdatedByAdminId: admin.id })
      .where(eq(pages.id, page!.id));
    await recordAudit(tx, admin, { action: "content.draft_saved", entityType: "page", entityId: slug, after: changes });
    for (const [kind, ids] of Object.entries(changes) as [keyof SectionChanges, string[]][]) {
      if (!ids.length) continue;
      const types = ids.map((id) => [...sections, ...page!.draft].find((s) => s.id === id)?.type);
      await recordAudit(tx, admin, { action: CHANGE_ACTIONS[kind], entityType: "page", entityId: slug, after: { sections: ids, types } });
    }
  });
  return adminPage(slug);
}

/** Makes the draft live as a new version. The storefront revalidates the page right after. */
export async function publish(admin: Admin, slug: EditablePage) {
  await ensurePage(slug);
  const version = await db.transaction(async (tx) => {
    const [page] = await tx.select().from(pages).where(eq(pages.slug, slug)).for("update");
    const parsed = pageSectionsSchema.safeParse(page!.draft);
    if (!parsed.success) throw new DomainError("INVALID_PAGE", "The draft has errors. Fix them in the editor, then publish.", 422);
    const [{ latest } = { latest: 0 }] = await tx
      .select({ latest: max(pageVersions.version) })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, page!.id));
    const next = (latest ?? 0) + 1;
    await tx.insert(pageVersions).values({ pageId: page!.id, version: next, sections: parsed.data, publishedByAdminId: admin.id });
    await tx
      .update(pages)
      .set({ published: parsed.data, publishedVersion: next, publishedAt: new Date() })
      .where(eq(pages.id, page!.id));
    await recordAudit(tx, admin, {
      action: "content.page_published",
      entityType: "page",
      entityId: slug,
      after: { version: next, sections: parsed.data.length },
    });
    return next;
  });
  return { version, page: await adminPage(slug) };
}

export async function listVersions(slug: EditablePage): Promise<PageVersionDTO[]> {
  const page = await ensurePage(slug);
  const rows = await db
    .select({
      version: pageVersions.version,
      publishedAt: pageVersions.publishedAt,
      publishedBy: adminUsers.email,
      sectionCount: sql<number>`jsonb_array_length(${pageVersions.sections})::int`,
    })
    .from(pageVersions)
    .leftJoin(adminUsers, eq(adminUsers.id, pageVersions.publishedByAdminId))
    .where(eq(pageVersions.pageId, page.id))
    .orderBy(desc(pageVersions.version))
    .limit(50);
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString(), live: r.version === page.publishedVersion }));
}

/** Copies a saved version into the draft. It goes live only when someone publishes. */
export async function restoreVersion(admin: Admin, slug: EditablePage, version: number) {
  const page = await ensurePage(slug);
  const [row] = await db
    .select({ sections: pageVersions.sections })
    .from(pageVersions)
    .where(and(eq(pageVersions.pageId, page.id), eq(pageVersions.version, version)));
  if (!row) throw notFound("Version");
  await db.transaction(async (tx) => {
    await tx
      .update(pages)
      .set({ draft: row.sections, draftUpdatedAt: new Date(), draftUpdatedByAdminId: admin.id })
      .where(eq(pages.id, page.id));
    await recordAudit(tx, admin, { action: "content.version_restored", entityType: "page", entityId: slug, after: { version } });
  });
  return adminPage(slug);
}

/* ───────────────────────────── Media library ───────────────────────────── */

/**
 * Every image URL referenced by any draft, live page or saved version.
 * ponytail: scans page JSON as text; fine for a handful of pages, index media ids if pages grow into the hundreds.
 */
async function referencedText() {
  const [row] = await db.execute<{ text: string | null }>(sql`
    select coalesce((select string_agg(draft::text || coalesce(published::text, ''), ' ') from ${pages}), '')
      || coalesce((select string_agg(sections::text, ' ') from ${pageVersions}), '') as text`);
  return row?.text ?? "";
}

function toMediaDTO(row: typeof mediaAssets.$inferSelect, used: string): MediaAssetDTO {
  const url = resolveImageUrl(row.provider, row.storageKey);
  return {
    id: row.id,
    url,
    alt: row.alt,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    originalName: row.originalName,
    createdAt: row.createdAt.toISOString(),
    inUse: used.includes(JSON.stringify(url).slice(1, -1)),
  };
}

export async function listMedia(q: { q?: string; page: number; pageSize: number }) {
  const where = q.q ? or(ilike(mediaAssets.alt, `%${q.q}%`), ilike(mediaAssets.originalName, `%${q.q}%`)) : undefined;
  const [rows, [{ total } = { total: 0 }], used] = await Promise.all([
    db
      .select()
      .from(mediaAssets)
      .where(where)
      .orderBy(desc(mediaAssets.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(mediaAssets).where(where),
    referencedText(),
  ]);
  return {
    items: rows.map((r) => toMediaDTO(r, used)),
    page: q.page,
    pageSize: q.pageSize,
    total: Number(total),
    totalPages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
  };
}

/** Validates by content (magic bytes, then a full decode), stores WebP, records who uploaded it. */
export async function uploadMedia(admin: Admin, file: File, alt: string) {
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "Images must be 8 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(bytes)) throw new HttpError(415, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG, WebP or AVIF image.");
  const webp = await toWebp(bytes, 2400, 82).catch(() => {
    throw new HttpError(415, "UNSUPPORTED_IMAGE", "This image couldn't be read. Upload a JPEG, PNG, WebP or AVIF image.");
  });
  const key = `media/${new Date().getUTCFullYear()}/${randomToken(12)}.webp`;
  await providers.storage.upload(key, webp.data, "image/webp");
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(mediaAssets)
      .values({
        provider: providers.storage.name,
        storageKey: key,
        alt: alt.slice(0, 200),
        width: webp.width,
        height: webp.height,
        bytes: webp.data.byteLength,
        originalName: file.name.slice(0, 200) || null,
        createdByAdminId: admin.id,
      })
      .returning();
    await recordAudit(tx, admin, { action: "content.media_uploaded", entityType: "media", entityId: created!.id, after: { key, alt } });
    return created!;
  });
  return toMediaDTO(row, "");
}

export async function updateMediaAlt(id: string, alt: string) {
  const [row] = await db.update(mediaAssets).set({ alt }).where(eq(mediaAssets.id, id)).returning();
  if (!row) throw notFound("Image");
  return toMediaDTO(row, await referencedText());
}

/** Removes an image nobody uses; one still on a page or in a saved version is refused. */
export async function deleteMedia(admin: Admin, id: string) {
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!row) throw notFound("Image");
  if (toMediaDTO(row, await referencedText()).inUse) {
    throw new DomainError("MEDIA_IN_USE", "This image is used on the website or in a saved version, so it can't be deleted.", 409);
  }
  await db.transaction(async (tx) => {
    await tx.delete(mediaAssets).where(eq(mediaAssets.id, id));
    await recordAudit(tx, admin, { action: "content.media_deleted", entityType: "media", entityId: id, before: { key: row.storageKey } });
  });
  if (row.provider === providers.storage.name) await providers.storage.delete(row.storageKey);
}

