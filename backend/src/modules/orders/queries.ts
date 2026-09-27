import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  OrderDetailDTO,
  OrderSummaryDTO,
  RefundDTO,
  ReturnSummaryDTO,
  ShipmentDTO,
  StatusHistoryDTO,
  TrackOrderDTO,
} from "../../contracts/dto";
import { db } from "../../db/client";
import {
  orderItems,
  orderStatusHistory,
  orders,
  productVariants,
  products,
  refunds,
  returnItems,
  returns,
  shipmentEvents,
  shipments,
} from "../../db/schema";
import { customerCanCancel } from "../../domain/order-state-machine";
import { OPEN_OR_ACCEPTED_RETURN_STATUSES, evaluateReturnEligibility } from "../../domain/returns";
import { iso } from "../../lib/http";
import type { OrderRow } from "./lifecycle";

export async function orderSummaries(rows: OrderRow[]): Promise<OrderSummaryDTO[]> {
  const ids = rows.map((o) => o.id);
  const items = ids.length
    ? await db
        .select({ orderId: orderItems.orderId, quantity: orderItems.quantity, imageUrl: orderItems.imageUrl })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
    : [];
  return rows.map((o) => {
    const mine = items.filter((i) => i.orderId === o.id);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalPaise: o.totalPaise,
      itemCount: mine.reduce((s, i) => s + i.quantity, 0),
      placedAt: o.placedAt.toISOString(),
      previewImages: mine
        .map((i) => i.imageUrl)
        .filter((u): u is string => Boolean(u))
        .slice(0, 3),
    };
  });
}

export async function statusHistory(orderId: string): Promise<StatusHistoryDTO[]> {
  const rows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(asc(orderStatusHistory.createdAt));
  return rows.map((h) => ({
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorType: h.actorType,
    note: h.note,
    createdAt: h.createdAt.toISOString(),
  }));
}

export async function orderShipments(orderId: string): Promise<ShipmentDTO[]> {
  const rows = await db.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(asc(shipments.createdAt));
  if (rows.length === 0) return [];
  const events = await db
    .select()
    .from(shipmentEvents)
    .where(
      inArray(
        shipmentEvents.shipmentId,
        rows.map((s) => s.id),
      ),
    )
    .orderBy(asc(shipmentEvents.occurredAt));
  return rows.map((s) => ({
    id: s.id,
    courierName: s.courierName,
    awb: s.awb,
    trackingUrl: s.trackingUrl,
    status: s.status,
    events: events
      .filter((e) => e.shipmentId === s.id)
      .map((e) => ({ status: e.status, description: e.description, location: e.location, occurredAt: e.occurredAt.toISOString() })),
  }));
}

export async function returnSummaries(where: { orderIds?: string[]; userId?: string }): Promise<ReturnSummaryDTO[]> {
  const conds = [];
  if (where.orderIds) {
    if (where.orderIds.length === 0) return [];
    conds.push(inArray(returns.orderId, where.orderIds));
  }
  if (where.userId) conds.push(eq(returns.userId, where.userId));
  const rows = await db
    .select({ r: returns, orderNumber: orders.orderNumber })
    .from(returns)
    .innerJoin(orders, eq(orders.id, returns.orderId))
    .where(and(...conds))
    .orderBy(desc(returns.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.r.id);
  const [items, refundRows] = await Promise.all([
    db
      .select({
        returnId: returnItems.returnId,
        orderItemId: returnItems.orderItemId,
        quantity: returnItems.quantity,
        productName: orderItems.productName,
        size: orderItems.size,
        exchangeSize: productVariants.size,
      })
      .from(returnItems)
      .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
      .leftJoin(productVariants, eq(productVariants.id, returnItems.exchangeVariantId))
      .where(inArray(returnItems.returnId, ids)),
    db
      .select({ returnId: refunds.returnId, amount: sql<number>`sum(${refunds.amountPaise})::int` })
      .from(refunds)
      .where(inArray(refunds.returnId, ids))
      .groupBy(refunds.returnId),
  ]);
  return rows.map(({ r, orderNumber }) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    orderNumber,
    type: r.type,
    status: r.status,
    reason: r.reason,
    customerNote: r.customerNote,
    infoRequest: r.infoRequest,
    createdAt: r.createdAt.toISOString(),
    items: items
      .filter((i) => i.returnId === r.id)
      .map((i) => ({
        orderItemId: i.orderItemId,
        productName: i.productName,
        size: i.size,
        quantity: i.quantity,
        exchangeSize: i.exchangeSize,
      })),
    refundPaise: refundRows.find((x) => x.returnId === r.id)?.amount ?? null,
  }));
}

export async function orderRefunds(orderId: string): Promise<RefundDTO[]> {
  const rows = await db
    .select({ f: refunds, returnNumber: returns.returnNumber })
    .from(refunds)
    .leftJoin(returns, eq(returns.id, refunds.returnId))
    .where(eq(refunds.orderId, orderId))
    .orderBy(desc(refunds.createdAt));
  return rows.map(({ f, returnNumber }) => ({
    id: f.id,
    amountPaise: f.amountPaise,
    method: f.method,
    status: f.status,
    reason: f.reason,
    returnNumber,
    createdAt: f.createdAt.toISOString(),
    processedAt: iso(f.processedAt),
  }));
}

/** Units per order line already claimed by open or accepted return requests. */
export async function claimedReturnQuantities(orderId: string) {
  const rows = await db
    .select({ orderItemId: returnItems.orderItemId, qty: sql<number>`sum(${returnItems.quantity})::int` })
    .from(returnItems)
    .innerJoin(returns, eq(returns.id, returnItems.returnId))
    .where(and(eq(returns.orderId, orderId), inArray(returns.status, [...OPEN_OR_ACCEPTED_RETURN_STATUSES])))
    .groupBy(returnItems.orderItemId);
  return new Map(rows.map((r) => [r.orderItemId, Number(r.qty)]));
}

export async function buildOrderDetail(order: OrderRow, now = new Date()): Promise<OrderDetailDTO> {
  const [items, history, shipmentList, returnList, refundList, claimed] = await Promise.all([
    db
      .select({ item: orderItems, slug: products.slug })
      .from(orderItems)
      .leftJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, order.id)),
    statusHistory(order.id),
    orderShipments(order.id),
    returnSummaries({ orderIds: [order.id] }),
    orderRefunds(order.id),
    claimedReturnQuantities(order.id),
  ]);
  const [summary] = await orderSummaries([order]);
  const eligibility = evaluateReturnEligibility(order, now);
  const itemDTOs = items.map(({ item, slug }) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    productName: item.productName,
    size: item.size,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    unitMrpPaise: item.unitMrpPaise,
    unitPricePaise: item.unitPricePaise,
    lineSubtotalPaise: item.lineSubtotalPaise,
    discountPaise: item.discountPaise,
    lineTotalPaise: item.lineTotalPaise,
    returnableQuantity: eligibility.ok ? Math.max(0, item.quantity - (claimed.get(item.id) ?? 0)) : 0,
    productSlug: slug,
  }));
  const anyReturnable = itemDTOs.some((i) => i.returnableQuantity > 0);

  return {
    ...summary!,
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    shippingPaise: order.shippingPaise,
    codFeePaise: order.codFeePaise,
    couponCodes: order.couponCodes,
    shippingAddress: order.shippingAddress as OrderDetailDTO["shippingAddress"],
    items: itemDTOs,
    history,
    shipments: shipmentList,
    cancelDeadlineAt: order.cancelDeadlineAt.toISOString(),
    canCancel: customerCanCancel(order, now),
    deliveredAt: iso(order.deliveredAt),
    returnDeadlineAt: iso(order.returnDeadlineAt),
    canRequestReturn: eligibility.ok && anyReturnable,
    returnUnavailableReason: !eligibility.ok ? eligibility.message : anyReturnable ? null : "All items already have a return request.",
    returns: returnList,
    refunds: refundList,
    cancelReason: order.cancelReason,
    paymentExpiresAt: iso(order.paymentExpiresAt),
  };
}

/** Public tracking view: no address details beyond the city, no prices. */
export async function buildTrackView(order: OrderRow): Promise<TrackOrderDTO> {
  const [summary] = await orderSummaries([order]);
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt.toISOString(),
    itemCount: summary!.itemCount,
    city: order.shippingAddress.city,
    history: await statusHistory(order.id),
    shipments: await orderShipments(order.id),
  };
}
