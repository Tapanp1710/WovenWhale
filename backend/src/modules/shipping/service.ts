import { eq } from "drizzle-orm";
import type { AdminContext } from "../../app-env";
import type { OrderStatus, ShipmentStatus } from "../../contracts/enums";
import { db } from "../../db/client";
import { orderItems, orders, shipmentEvents, shipments } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { isTransitionAllowed } from "../../domain/order-state-machine";
import { providers } from "../../integrations";
import type { TrackingEvent } from "../../integrations/shipping/types";
import { recordAudit } from "../../lib/audit";
import { logger } from "../../lib/logger";
import { captureException } from "../../lib/monitoring";
import { kickNotificationDispatch } from "../notifications/service";
import { transitionOrder } from "../orders/lifecycle";

/**
 * Books a shipment through the configured ShippingService provider and
 * records the courier/AWB. With the manual provider, ops supply the AWB.
 * Moves a PACKED order to SHIPPED in the same transaction.
 */
export async function createShipment(
  admin: AdminContext,
  orderId: string,
  input: { courierName: string; awb: string; trackingUrl: string | null },
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
  if (order.status !== "PACKED") throw new DomainError("ORDER_NOT_PACKED", "Mark the order as packed before shipping.", 409);

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const booked = await providers.shipping.createShipment({
    orderNumber: order.orderNumber,
    address: order.shippingAddress,
    items: items.map((i) => ({ sku: i.sku, name: i.productName, quantity: i.quantity, unitPricePaise: i.unitPricePaise })),
    codAmountPaise: order.paymentMethod === "COD" ? order.totalPaise : 0,
    weightGrams: items.reduce((s, i) => s + i.quantity * 350, 0),
  });

  try {
    await db.transaction(async (tx) => {
      const [shipment] = await tx
        .insert(shipments)
        .values({
          orderId,
          provider: providers.shipping.name,
          providerShipmentId: booked.providerShipmentId,
          awb: booked.awb ?? input.awb,
          courierName: booked.courierName ?? input.courierName,
          trackingUrl: booked.trackingUrl ?? input.trackingUrl,
          status: "PICKED_UP",
        })
        .returning();
      await tx
        .insert(shipmentEvents)
        .values({ shipmentId: shipment!.id, status: "PICKED_UP", description: "Handed over to courier", occurredAt: new Date() });
      await transitionOrder(
        tx,
        orderId,
        "SHIPPED",
        { type: "ADMIN", id: admin.id, permissions: admin.permissions },
        { note: `${shipment!.courierName} · AWB ${shipment!.awb}` },
      );
      await recordAudit(tx, admin, {
        action: "order.shipped",
        entityType: "order",
        entityId: orderId,
        after: { courier: shipment!.courierName, awb: shipment!.awb },
      });
    });
  } catch (error) {
    // The carrier booking exists but the order didn't ship: cancel it so no pickup is scheduled.
    await providers.shipping
      .cancelShipment(booked.providerShipmentId)
      .catch((cancelError: unknown) =>
        logger.error("shipment_cancel_failed", { orderId, providerShipmentId: booked.providerShipmentId, error: String(cancelError) }),
      );
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new DomainError("AWB_IN_USE", "This AWB number is already assigned to another shipment.", 409);
    }
    throw error;
  }
  kickNotificationDispatch();
}

const ORDER_STATUS_FOR_SHIPMENT: Partial<Record<ShipmentStatus, OrderStatus>> = {
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
};

/** Applies carrier tracking events (webhook), advancing the order where the state machine allows. */
export async function applyTrackingEvents(events: TrackingEvent[]) {
  for (const e of events) {
    try {
      await db.transaction(async (tx) => {
        const [shipment] = await tx.select().from(shipments).where(eq(shipments.awb, e.awb)).for("update");
        if (!shipment) return;
        const inserted = await tx
          .insert(shipmentEvents)
          .values({
            shipmentId: shipment.id,
            status: e.status,
            description: e.description,
            location: e.location,
            providerEventId: e.providerEventId,
            occurredAt: e.occurredAt,
          })
          .onConflictDoNothing()
          .returning({ id: shipmentEvents.id });
        if (inserted.length === 0) return; // duplicate webhook
        await tx.update(shipments).set({ status: e.status }).where(eq(shipments.id, shipment.id));

        const target = ORDER_STATUS_FOR_SHIPMENT[e.status];
        const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, shipment.orderId));
        // Out-of-order or repeated carrier events are ignored rather than failing.
        if (target && order && isTransitionAllowed(order.status, target)) {
          await transitionOrder(
            tx,
            shipment.orderId,
            target,
            { type: "SYSTEM", reason: "carrier_webhook" },
            { note: e.description || null, now: e.occurredAt },
          );
        }
      });
    } catch (error) {
      captureException(error, { job: "tracking", awb: e.awb });
    }
  }
  kickNotificationDispatch();
}
