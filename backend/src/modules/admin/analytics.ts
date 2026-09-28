import { and, asc, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { rangeQuerySchema } from "../../contracts/admin";
import type { AnalyticsDTO, DashboardDTO, InventorySummaryDTO, KpiDTO } from "../../contracts/dto";
import type { OrderStatus, PaymentStatus } from "../../contracts/enums";
import { db } from "../../db/client";
import {
  adminUsers,
  categories,
  checkoutSessions,
  customerEvents,
  customerProfiles,
  inventoryTransactions,
  orderItems,
  orders,
  products,
  productVariants,
  refunds,
  returns,
  users,
} from "../../db/schema";
import { readQuery } from "../../lib/http";
import { requirePermission } from "../auth/middleware";
import { lowStockRows } from "./inventory";
import { getStoreSettings } from "../settings/service";
import { adminOrderRows, codActionable } from "./orders";
import { productStockExpressions, statusFilter } from "./product-stock";

const TZ = "Asia/Kolkata";
const DAY = 24 * 60 * 60 * 1000;

/** Orders that represent real demand: excludes cancelled, rejected and never-paid orders. */
const counted = sql`${orders.status} not in ('CANCELLED','REJECTED','PENDING_PAYMENT')`;
const actor = sql`coalesce(${customerEvents.visitorId}, ${customerEvents.userId}::text)`;

function resolveRange(q: { from?: Date; to?: Date }) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 29 * DAY);
  return { from: new Date(Math.min(from.getTime(), to.getTime())), to };
}

const inRange = (col: typeof orders.placedAt | typeof customerEvents.createdAt, r: { from: Date; to: Date }) =>
  and(gte(col, r.from), lt(col, r.to));

async function distinctActors(type: string, r: { from: Date; to: Date }) {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${actor})::int` })
    .from(customerEvents)
    .where(and(eq(customerEvents.type, type), inRange(customerEvents.createdAt, r)));
  return Number(row?.n ?? 0);
}

async function eventCount(type: string, r: { from: Date; to: Date }) {
  const [row] = await db
    .select({ n: count() })
    .from(customerEvents)
    .where(and(eq(customerEvents.type, type), inRange(customerEvents.createdAt, r)));
  return Number(row?.n ?? 0);
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 10000 : 0);

async function orderTotals(r: { from: Date; to: Date }) {
  const [row] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${counted}), 0)::bigint`,
      orders: sql<number>`(count(*) filter (where ${counted}))::int`,
      customers: sql<number>`(count(distinct ${orders.userId}) filter (where ${counted}))::int`,
    })
    .from(orders)
    .where(inRange(orders.placedAt, r));
  return { revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0), customers: Number(row?.customers ?? 0) };
}

async function kpis(r: { from: Date; to: Date }): Promise<KpiDTO> {
  const totals = await orderTotals(r);
  const [visitors, [newCustomers], [abandoned], [codPending], [refundRow], [openReturns], lowStock] = await Promise.all([
    distinctActors("PAGE_VIEW", r),
    db
      .select({ n: count() })
      .from(users)
      .where(and(gte(users.createdAt, r.from), lt(users.createdAt, r.to))),
    db
      .select({ n: count() })
      .from(checkoutSessions)
      .where(
        and(eq(checkoutSessions.status, "ABANDONED"), gte(checkoutSessions.abandonedAt, r.from), lt(checkoutSessions.abandonedAt, r.to)),
      ),
    db.select({ n: count() }).from(orders).where(codActionable()),
    db
      .select({ sum: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::bigint`, n: count() })
      .from(refunds)
      .where(and(eq(refunds.status, "PROCESSED"), gte(refunds.processedAt, r.from), lt(refunds.processedAt, r.to))),
    db
      .select({ n: count() })
      .from(returns)
      .where(sql`${returns.status} in ('REQUESTED','INFO_REQUESTED','APPROVED','RECEIVED','REFUND_INITIATED')`),
    lowStockRows(1000),
  ]);
  return {
    revenuePaise: totals.revenue,
    orders: totals.orders,
    customers: totals.customers,
    newCustomers: Number(newCustomers?.n ?? 0),
    averageOrderValuePaise: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
    conversionRate: ratio(totals.orders, visitors),
    abandonedCheckouts: Number(abandoned?.n ?? 0),
    codPendingApproval: Number(codPending?.n ?? 0),
    refundsPaise: Number(refundRow?.sum ?? 0),
    refundCount: Number(refundRow?.n ?? 0),
    openReturns: Number(openReturns?.n ?? 0),
    lowStockVariants: lowStock.length,
  };
}

async function dailySeries(r: { from: Date; to: Date }) {
  const rows = await db.execute<{ date: string; revenue: string; orders: string; customers: string; visitors: string }>(sql`
    with days as (
      select generate_series(date_trunc('day', ${r.from.toISOString()}::timestamptz at time zone ${TZ}),
                             date_trunc('day', ${r.to.toISOString()}::timestamptz at time zone ${TZ}), interval '1 day')::date as d
    ),
    o as (
      select (placed_at at time zone ${TZ})::date as d, sum(total_paise) as revenue, count(*) as orders
      from orders where placed_at >= ${r.from.toISOString()}::timestamptz and placed_at < ${r.to.toISOString()}::timestamptz
        and status not in ('CANCELLED','REJECTED','PENDING_PAYMENT')
      group by 1
    ),
    u as (
      select (created_at at time zone ${TZ})::date as d, count(*) as customers
      from users where created_at >= ${r.from.toISOString()}::timestamptz and created_at < ${r.to.toISOString()}::timestamptz group by 1
    ),
    v as (
      select (created_at at time zone ${TZ})::date as d, count(distinct coalesce(visitor_id, user_id::text)) as visitors
      from customer_events where type = 'PAGE_VIEW' and created_at >= ${r.from.toISOString()}::timestamptz and created_at < ${r.to.toISOString()}::timestamptz group by 1
    )
    select to_char(days.d, 'YYYY-MM-DD') as date, coalesce(o.revenue, 0) as revenue, coalesce(o.orders, 0) as orders,
           coalesce(u.customers, 0) as customers, coalesce(v.visitors, 0) as visitors
    from days left join o on o.d = days.d left join u on u.d = days.d left join v on v.d = days.d
    order by days.d
  `);
  return rows.map((x) => ({
    date: x.date,
    revenuePaise: Number(x.revenue),
    orders: Number(x.orders),
    customers: Number(x.customers),
    visitors: Number(x.visitors),
  }));
}

async function categoryPerformance(r: { from: Date; to: Date }) {
  const rows = await db
    .select({
      category: sql<string>`coalesce(${categories.name}, 'Uncategorised')`,
      revenuePaise: sql<number>`sum(${orderItems.lineTotalPaise})::bigint`,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      orders: sql<number>`count(distinct ${orders.id})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .leftJoin(categories, eq(categories.id, products.primaryCategoryId))
    .where(and(counted, inRange(orders.placedAt, r)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);
  return rows.map((x) => ({
    category: x.category,
    revenuePaise: Number(x.revenuePaise),
    units: Number(x.units),
    orders: Number(x.orders),
  }));
}

async function topProducts(r: { from: Date; to: Date }, limit = 10) {
  const rows = await db.execute<{ product_id: string; name: string; units: string; revenue: string; views: string; atc: string }>(sql`
    with sales as (
      select oi.product_id, sum(oi.quantity) as units, sum(oi.line_total_paise) as revenue
      from order_items oi join orders o on o.id = oi.order_id
      where o.placed_at >= ${r.from.toISOString()}::timestamptz and o.placed_at < ${r.to.toISOString()}::timestamptz
        and o.status not in ('CANCELLED','REJECTED','PENDING_PAYMENT')
      group by 1
    ),
    ev as (
      select product_id,
             count(*) filter (where type = 'PRODUCT_VIEW') as views,
             count(*) filter (where type = 'ADD_TO_CART') as atc
      from customer_events
      where product_id is not null and created_at >= ${r.from.toISOString()}::timestamptz and created_at < ${r.to.toISOString()}::timestamptz
      group by 1
    )
    select p.id as product_id, p.name, coalesce(s.units, 0) as units, coalesce(s.revenue, 0) as revenue,
           coalesce(ev.views, 0) as views, coalesce(ev.atc, 0) as atc
    from products p left join sales s on s.product_id = p.id left join ev on ev.product_id = p.id
    where s.units is not null or ev.views is not null
    order by coalesce(s.revenue, 0) desc, coalesce(ev.views, 0) desc
    limit ${limit}
  `);
  return rows.map((x) => ({
    productId: x.product_id,
    name: x.name,
    units: Number(x.units),
    revenuePaise: Number(x.revenue),
    views: Number(x.views),
    addToCarts: Number(x.atc),
  }));
}

export async function buildDashboard(r: { from: Date; to: Date }): Promise<DashboardDTO> {
  const [k, series, cats, top, statusRows, paymentRows, acquisition, funnel, codPending, lowStock, inventorySummary] = await Promise.all([
    kpis(r),
    dailySeries(r),
    categoryPerformance(r),
    topProducts(r, 8),
    db.select({ status: orders.status, count: count() }).from(orders).where(inRange(orders.placedAt, r)).groupBy(orders.status),
    db
      .select({ status: orders.paymentStatus, count: count() })
      .from(orders)
      .where(inRange(orders.placedAt, r))
      .groupBy(orders.paymentStatus),
    db
      .select({ source: sql<string>`coalesce(${customerProfiles.acquisitionSource}, 'direct')`, customers: count() })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .where(and(gte(users.createdAt, r.from), lt(users.createdAt, r.to)))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    funnelStages(r),
    adminOrderRows(codActionable(), [asc(orders.placedAt)], 10, 0),
    lowStockRows(8),
    inventorySnapshot(),
  ]);
  return {
    range: { from: r.from.toISOString(), to: r.to.toISOString() },
    kpis: k,
    series: series.map(({ date, revenuePaise, orders: o, customers }) => ({ date, revenuePaise, orders: o, customers })),
    salesByCategory: cats.map(({ category, revenuePaise, units }) => ({ category, revenuePaise, units })),
    topProducts: top.map(({ productId, name, units, revenuePaise }) => ({ productId, name, units, revenuePaise })),
    orderStatusDistribution: statusRows.map((s) => ({ status: s.status as OrderStatus, count: Number(s.count) })),
    paymentStatusDistribution: paymentRows.map((s) => ({ status: s.status as PaymentStatus, count: Number(s.count) })),
    acquisition: acquisition.map((a) => ({ source: a.source, customers: Number(a.customers) })),
    funnel,
    codPending,
    lowStock,
    inventory: inventorySummary,
  };
}

/** Catalogue health for the dashboard, using the same stock definitions as the products list. */
async function inventorySnapshot(): Promise<InventorySummaryDTO> {
  const settings = await getStoreSettings();
  const stock = productStockExpressions(settings.lowStockThreshold);
  const live = isNull(products.deletedAt);
  const [[row], restocks] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${statusFilter.ACTIVE})::int`,
        low: sql<number>`count(*) filter (where ${stock.stockFilter.LOW_STOCK})::int`,
        out: sql<number>`count(*) filter (where ${stock.stockFilter.OUT_OF_STOCK})::int`,
      })
      .from(products)
      .where(live),
    db
      .select({
        productId: products.id,
        productName: products.name,
        size: productVariants.size,
        quantity: inventoryTransactions.onHandDelta,
        actor: adminUsers.fullName,
        createdAt: inventoryTransactions.createdAt,
      })
      .from(inventoryTransactions)
      .innerJoin(productVariants, eq(productVariants.id, inventoryTransactions.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(adminUsers, eq(adminUsers.id, inventoryTransactions.adminUserId))
      .where(eq(inventoryTransactions.type, "STOCK_IN"))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(5),
  ]);
  return {
    totalProducts: Number(row?.total ?? 0),
    activeProducts: Number(row?.active ?? 0),
    lowStockProducts: Number(row?.low ?? 0),
    outOfStockProducts: Number(row?.out ?? 0),
    recentRestocks: restocks.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

async function funnelStages(r: { from: Date; to: Date }) {
  const [visitors, viewers, carts, checkouts, ordersPlaced] = await Promise.all([
    distinctActors("PAGE_VIEW", r),
    distinctActors("PRODUCT_VIEW", r),
    distinctActors("ADD_TO_CART", r),
    distinctActors("CHECKOUT_STARTED", r),
    distinctActors("ORDER_CREATED", r),
  ]);
  return [
    { stage: "Visitors", count: visitors },
    { stage: "Viewed a product", count: viewers },
    { stage: "Added to bag", count: carts },
    { stage: "Started checkout", count: checkouts },
    { stage: "Placed order", count: ordersPlaced },
  ];
}

export async function buildAnalytics(r: { from: Date; to: Date }): Promise<AnalyticsDTO> {
  const [
    totals,
    visitors,
    productViews,
    atcActors,
    checkoutActors,
    paymentStarted,
    paymentSuccess,
    series,
    cats,
    top,
    searches,
    abandonment,
    returning,
  ] = await Promise.all([
    orderTotals(r),
    distinctActors("PAGE_VIEW", r),
    eventCount("PRODUCT_VIEW", r),
    distinctActors("ADD_TO_CART", r),
    distinctActors("CHECKOUT_STARTED", r),
    eventCount("PAYMENT_STARTED", r),
    eventCount("PAYMENT_SUCCESS", r),
    dailySeries(r),
    categoryPerformance(r),
    topProducts(r, 12),
    db
      .select({ query: sql<string>`${customerEvents.metadata}->>'query'`, count: count() })
      .from(customerEvents)
      .where(
        and(eq(customerEvents.type, "SEARCH"), inRange(customerEvents.createdAt, r), sql`${customerEvents.metadata}->>'query' is not null`),
      )
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
    db
      .select({
        started: sql<number>`count(*)::int`,
        abandoned: sql<number>`(count(*) filter (where ${checkoutSessions.abandonedAt} is not null))::int`,
        recovered: sql<number>`(count(*) filter (where ${checkoutSessions.recoveryStatus} = 'RECOVERED'))::int`,
      })
      .from(checkoutSessions)
      .where(and(gte(checkoutSessions.createdAt, r.from), lt(checkoutSessions.createdAt, r.to))),
    db.execute<{ returning: string }>(sql`
        select count(*) as returning from (
          select o.user_id from orders o
          where o.status not in ('CANCELLED','REJECTED','PENDING_PAYMENT')
          group by o.user_id
          having count(*) >= 2
             and max(o.placed_at) >= ${r.from.toISOString()}::timestamptz and max(o.placed_at) < ${r.to.toISOString()}::timestamptz
        ) t
      `),
  ]);
  const ab = abandonment[0] ?? { started: 0, abandoned: 0, recovered: 0 };
  const returningCustomers = Number(returning[0]?.returning ?? 0);
  return {
    range: { from: r.from.toISOString(), to: r.to.toISOString() },
    visitors,
    productViews,
    addToCartRate: ratio(atcActors, visitors),
    checkoutRate: ratio(checkoutActors, atcActors),
    paymentSuccessRate: ratio(paymentSuccess, paymentStarted),
    conversionRate: ratio(totals.orders, visitors),
    averageOrderValuePaise: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
    revenuePaise: totals.revenue,
    returningCustomers,
    returningCustomerRate: ratio(returningCustomers, totals.customers),
    abandonedCheckoutRate: ratio(Number(ab.abandoned), Number(ab.started)),
    cartRecoveryRate: ratio(Number(ab.recovered), Number(ab.abandoned)),
    topProducts: top,
    categoryPerformance: cats,
    topSearches: searches.map((s) => ({ query: s.query, count: Number(s.count) })),
    series: series.map(({ date, visitors: v, orders: o, revenuePaise }) => ({ date, visitors: v, orders: o, revenuePaise })),
  };
}

export const adminDashboardRoutes = new Hono<AppEnv>().get("/", requirePermission("dashboard.view"), async (c) =>
  c.json(await buildDashboard(resolveRange(readQuery(c, rangeQuerySchema)))),
);

export const adminAnalyticsRoutes = new Hono<AppEnv>().get("/", requirePermission("analytics.view"), async (c) =>
  c.json(await buildAnalytics(resolveRange(readQuery(c, rangeQuerySchema)))),
);
