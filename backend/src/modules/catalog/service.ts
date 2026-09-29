import { and, asc, count, desc, eq, inArray, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type {
  CatalogFacets,
  CategoryDTO,
  FacetOption,
  HomeFeedDTO,
  ProductDetailDTO,
  ProductListResponse,
  SearchSuggestion,
} from "../../contracts/dto";
import type { ProductListQuery } from "../../contracts/storefront";
import { db } from "../../db/client";
import { ref } from "../../db/sql";
import { categories, inventory, orderItems, orders, productCategories, productImages, productVariants, products } from "../../db/schema";
import { resolveImageUrl } from "../../integrations/storage";
import { notFound } from "../../lib/http";
import { getStoreSettings } from "../settings/service";
import { availableExpr, loadProductCards, sizeRank, toImageDTO } from "./cards";

/* ───────────────────────────── Filter building ───────────────────────────── */

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const lowerIn = (column: SQL, values: string[]) =>
  inArray(
    sql`lower(${column})`,
    values.map((v) => v.toLowerCase()),
  );

const activeProduct = and(eq(products.isActive, true), isNull(products.deletedAt))!;

const inStockExpr = sql<boolean>`exists (
  select 1 from ${productVariants} v join ${inventory} i on i.variant_id = v.id
  where v.product_id = ${ref(products.id)} and v.is_active and i.on_hand - i.reserved > 0
)`;

function categoryCondition(slug: string): SQL {
  return sql`exists (
    select 1 from ${productCategories} pc join ${categories} c on c.id = pc.category_id
    where pc.product_id = ${ref(products.id)} and c.slug = ${slug} and c.is_active
  )`;
}

/** Name, SKU, tags, attributes and category names — case-insensitive. */
export function searchCondition(q: string): SQL {
  const like = `%${escapeLike(q)}%`;
  return sql`(
    ${products.name} ilike ${like}
    or ${products.sku} ilike ${`${escapeLike(q)}%`}
    or array_to_string(${products.tags}, ' ') ilike ${like}
    or coalesce(${products.fabric}, '') ilike ${like}
    or coalesce(${products.pattern}, '') ilike ${like}
    or coalesce(${products.color}, '') ilike ${like}
    or ${products.productType} ilike ${like}
    or exists (
      select 1 from ${productCategories} pc join ${categories} c on c.id = pc.category_id
      where pc.product_id = ${ref(products.id)} and c.name ilike ${like}
    )
    or exists (select 1 from ${productVariants} v where v.product_id = ${ref(products.id)} and v.sku ilike ${`${escapeLike(q)}%`})
  )`;
}

/** Scope = category + search. Facets are computed over the scope so options never vanish while filtering. */
function scopeConditions(q: ProductListQuery): SQL[] {
  const conds: SQL[] = [activeProduct];
  if (q.category) conds.push(categoryCondition(q.category));
  if (q.q) conds.push(searchCondition(q.q));
  return conds;
}

function filterConditions(q: ProductListQuery): SQL[] {
  const conds = scopeConditions(q);
  if (q.size.length) {
    conds.push(sql`exists (
      select 1 from ${productVariants} v where v.product_id = ${ref(products.id)} and v.is_active
      and upper(v.size) in (${sql.join(
        q.size.map((s) => sql`${s.toUpperCase()}`),
        sql`, `,
      )})
    )`);
  }
  if (q.color.length) conds.push(lowerIn(sql`${products.color}`, q.color));
  if (q.fabric.length) conds.push(lowerIn(sql`${products.fabric}`, q.fabric));
  if (q.pattern.length) conds.push(lowerIn(sql`${products.pattern}`, q.pattern));
  if (q.type.length) conds.push(lowerIn(sql`${products.productType}`, q.type));
  if (q.minPrice !== undefined) conds.push(sql`${products.pricePaise} >= ${q.minPrice * 100}`);
  if (q.maxPrice !== undefined) conds.push(sql`${products.pricePaise} <= ${q.maxPrice * 100}`);
  if (q.availability === "in-stock") conds.push(inStockExpr);
  if (q.discount) conds.push(sql`${products.discountPercent} >= ${q.discount}`);
  return conds;
}

/** Units sold per product over paid/confirmed orders — drives "Best selling". */
const unitsSold = db
  .select({
    productId: orderItems.productId,
    units: sql<number>`sum(${orderItems.quantity})::int`.as("units"),
  })
  .from(orderItems)
  .innerJoin(orders, eq(orders.id, orderItems.orderId))
  .where(notInArray(orders.status, ["CANCELLED", "REJECTED", "PENDING_PAYMENT"]))
  .groupBy(orderItems.productId)
  .as("units_sold");

function orderBy(sort: ProductListQuery["sort"]): SQL[] {
  // Sold-out pieces always sink below available ones.
  const stockFirst = sql`${inStockExpr} desc`;
  switch (sort) {
    case "newest":
      return [stockFirst, desc(products.createdAt)];
    case "best-selling":
      return [stockFirst, sql`coalesce(${unitsSold.units}, 0) desc`, desc(products.isBestSeller), desc(products.createdAt)];
    case "price-low":
      return [stockFirst, asc(products.pricePaise)];
    case "price-high":
      return [stockFirst, desc(products.pricePaise)];
    case "discount":
      return [stockFirst, desc(products.discountPercent), asc(products.pricePaise)];
    case "name":
      return [asc(products.name)];
    case "featured":
    default:
      return [stockFirst, desc(products.isFeatured), desc(products.isBestSeller), desc(products.createdAt)];
  }
}

/* ────────────────────────────────── Queries ─────────────────────────────── */

export async function listProducts(q: ProductListQuery): Promise<ProductListResponse> {
  const where = and(...filterConditions(q));
  const [rows, [{ total } = { total: 0 }], facets, category] = await Promise.all([
    db
      .select({ id: products.id })
      .from(products)
      .leftJoin(unitsSold, eq(unitsSold.productId, products.id))
      .where(where)
      .orderBy(...orderBy(q.sort), asc(products.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(products).where(where),
    computeFacets(and(...scopeConditions(q))!),
    q.category ? getCategory(q.category) : Promise.resolve(null),
  ]);
  if (q.category && !category) throw notFound("Collection");

  return {
    items: await loadProductCards(rows.map((r) => r.id)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    facets,
    category,
  };
}

async function computeFacets(scope: SQL): Promise<CatalogFacets> {
  const facet = async (column: SQL): Promise<FacetOption[]> => {
    const rows = await db
      .select({ value: sql<string>`${column}`, count: sql<number>`count(distinct ${products.id})::int` })
      .from(products)
      .where(and(scope, sql`${column} is not null`, sql`${column} <> ''`))
      .groupBy(column)
      .orderBy(sql`2 desc`, column);
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  };

  const [sizes, colors, fabrics, patterns, types, [range]] = await Promise.all([
    db
      .select({ value: sql<string>`upper(${productVariants.size})`, count: sql<number>`count(distinct ${products.id})::int` })
      .from(products)
      .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)))
      .where(scope)
      .groupBy(sql`upper(${productVariants.size})`),
    facet(sql`${products.color}`),
    facet(sql`${products.fabric}`),
    facet(sql`${products.pattern}`),
    facet(sql`${products.productType}`),
    db
      .select({
        min: sql<number>`coalesce(min(${products.pricePaise}), 0)::int`,
        max: sql<number>`coalesce(max(${products.pricePaise}), 0)::int`,
      })
      .from(products)
      .where(scope),
  ]);

  return {
    sizes: sizes.map((s) => ({ value: s.value, count: Number(s.count) })).sort((a, b) => sizeRank(a.value) - sizeRank(b.value)),
    colors,
    fabrics,
    patterns,
    types,
    priceRange: { minPaise: Number(range?.min ?? 0), maxPaise: Number(range?.max ?? 0) },
  };
}

export async function listCategories(): Promise<CategoryDTO[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      seoTitle: categories.seoTitle,
      seoDescription: categories.seoDescription,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(categories)
    .leftJoin(productCategories, eq(productCategories.categoryId, categories.id))
    .leftJoin(products, and(eq(products.id, productCategories.productId), activeProduct))
    .where(and(eq(categories.isActive, true), eq(categories.isNavigable, true)))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.filter((r) => Number(r.productCount) > 0).map((r) => ({ ...r, productCount: Number(r.productCount) }));
}

export async function getCategory(slug: string): Promise<CategoryDTO | null> {
  const [row] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      seoTitle: categories.seoTitle,
      seoDescription: categories.seoDescription,
      productCount: sql<number>`(select count(*) from ${productCategories} pc join ${products} p on p.id = pc.product_id
        where pc.category_id = ${ref(categories.id)} and p.is_active and p.deleted_at is null)::int`,
    })
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)));
  return row ? { ...row, productCount: Number(row.productCount) } : null;
}

export async function getProductBySlug(slug: string): Promise<ProductDetailDTO> {
  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), activeProduct));
  if (!p) throw notFound("Product");

  const settings = await getStoreSettings();
  const [card] = await loadProductCards([p.id]);
  const [images, variants, cats] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, p.id)).orderBy(asc(productImages.sortOrder)),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        pricePaise: sql<number>`coalesce(${productVariants.pricePaise}, ${p.pricePaise})::int`,
        mrpPaise: sql<number>`coalesce(${productVariants.mrpPaise}, ${p.mrpPaise})::int`,
        available: availableExpr,
        threshold: inventory.lowStockThreshold,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.productId, p.id), eq(productVariants.isActive, true))),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(and(eq(productCategories.productId, p.id), eq(categories.isActive, true))),
  ]);

  return {
    ...card!,
    images: images.map((img) => toImageDTO(img, p.name)),
    sku: p.sku,
    shortDescription: p.shortDescription,
    description: p.description,
    tags: p.tags,
    categories: cats,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    updatedAt: p.updatedAt.toISOString(),
    variants: variants
      .map((v) => {
        const available = Math.max(0, Number(v.available));
        return {
          id: v.id,
          sku: v.sku,
          size: v.size,
          color: v.color,
          pricePaise: Number(v.pricePaise),
          mrpPaise: Number(v.mrpPaise),
          available,
          inStock: available > 0,
          lowStock: available > 0 && available <= (v.threshold ?? settings.lowStockThreshold),
        };
      })
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size)),
  };
}

/** Same primary category first, then same pattern/fabric, excluding the product itself. */
export async function relatedProducts(slug: string, limit = 8) {
  const [p] = await db
    .select({ id: products.id, primaryCategoryId: products.primaryCategoryId, pattern: products.pattern, fabric: products.fabric })
    .from(products)
    .where(eq(products.slug, slug));
  if (!p) throw notFound("Product");

  const score = sql`(case when ${products.primaryCategoryId} = ${p.primaryCategoryId} then 2 else 0 end)
    + (case when ${products.pattern} = ${p.pattern} then 1 else 0 end)
    + (case when ${products.fabric} = ${p.fabric} then 1 else 0 end)`;
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(activeProduct, ne(products.id, p.id), inStockExpr))
    .orderBy(sql`${score} desc`, desc(products.createdAt))
    .limit(limit);
  return loadProductCards(rows.map((r) => r.id));
}

export async function productsByIds(ids: string[]) {
  return loadProductCards(ids.slice(0, 24));
}

export async function searchSuggestions(q: string): Promise<SearchSuggestion> {
  const [productRows, categoryRows] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        pricePaise: products.pricePaise,
        imageProvider: sql<
          string | null
        >`(select provider from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
        imageKey: sql<
          string | null
        >`(select storage_key from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
      })
      .from(products)
      .where(and(activeProduct, searchCondition(q)))
      .orderBy(sql`${products.name} ilike ${`${escapeLike(q)}%`} desc`, sql`${inStockExpr} desc`, desc(products.isBestSeller))
      .limit(6),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .where(and(eq(categories.isActive, true), eq(categories.isNavigable, true), sql`${categories.name} ilike ${`%${escapeLike(q)}%`}`))
      .limit(4),
  ]);
  return {
    products: productRows.map((p) => ({
      slug: p.slug,
      name: p.name,
      pricePaise: p.pricePaise,
      imageUrl: p.imageProvider && p.imageKey ? resolveImageUrl(p.imageProvider, p.imageKey) : null,
    })),
    categories: categoryRows,
  };
}

export async function homeFeed(): Promise<HomeFeedDTO> {
  // 12: the most a homepage product section can show.
  const pick = (cond: SQL, order: SQL[], limit = 12) =>
    db
      .select({ id: products.id })
      .from(products)
      .leftJoin(unitsSold, eq(unitsSold.productId, products.id))
      .where(and(activeProduct, cond))
      .orderBy(...order)
      .limit(limit)
      .then((rows) => rows.map((r) => r.id));

  const [featuredIds, newIds, bestIds, cats] = await Promise.all([
    pick(and(eq(products.isFeatured, true), inStockExpr)!, [desc(products.createdAt)]),
    pick(and(eq(products.isNewArrival, true), inStockExpr)!, [desc(products.createdAt)]),
    pick(inStockExpr, [desc(products.isBestSeller), sql`coalesce(${unitsSold.units}, 0) desc`, desc(products.createdAt)]),
    listCategories(),
  ]);

  const covers = await db
    .select({
      categoryId: productCategories.categoryId,
      provider: productImages.provider,
      storageKey: productImages.storageKey,
    })
    .from(productCategories)
    .innerJoin(products, and(eq(products.id, productCategories.productId), activeProduct))
    .innerJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.sortOrder, 0)))
    .where(and(inArray(productCategories.categoryId, cats.map((c) => c.id).concat("00000000-0000-0000-0000-000000000000")), inStockExpr))
    .orderBy(desc(products.isFeatured), desc(products.createdAt));
  const coverByCategory = new Map<string, string>();
  for (const c of covers) {
    if (!coverByCategory.has(c.categoryId)) coverByCategory.set(c.categoryId, resolveImageUrl(c.provider, c.storageKey));
  }

  const [featured, newArrivals, bestSellers] = await Promise.all([
    loadProductCards(featuredIds),
    loadProductCards(newIds),
    loadProductCards(bestIds),
  ]);
  return {
    featured,
    newArrivals,
    bestSellers,
    categories: cats.map((c) => ({ ...c, coverImageUrl: coverByCategory.get(c.id) ?? null })),
  };
}

/** Slugs + timestamps for the sitemap. */
export async function sitemapEntries() {
  const [productRows, categoryRows] = await Promise.all([
    db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(activeProduct),
    db
      .select({ slug: categories.slug, updatedAt: categories.updatedAt })
      .from(categories)
      .where(and(eq(categories.isActive, true), eq(categories.isNavigable, true))),
  ]);
  return {
    products: productRows.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })),
    categories: categoryRows.map((c) => ({ slug: c.slug, updatedAt: c.updatedAt.toISOString() })),
  };
}
