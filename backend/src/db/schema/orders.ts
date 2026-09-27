import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  actorTypeEnum,
  createdAt,
  id,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  shipmentStatusEnum,
  updatedAt,
} from "./_shared";
import { productVariants, products } from "./catalog";
import { adminUsers, users } from "./identity";

/** Immutable copy of the delivery address at the moment the order was placed. */
export interface AddressSnapshot {
  fullName: string;
  phone: string;
  email: string | null;
  line1: string;
  line2: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  addressType: string;
}

/**
 * Orders. `status` (fulfilment lifecycle) and `payment_status` (money
 * lifecycle) are deliberately separate columns with separate state machines.
 */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderNumber: varchar("order_number", { length: 24 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: orderStatusEnum("status").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    codFeePaise: integer("cod_fee_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    couponCodes: text("coupon_codes").array().notNull().default(sql`'{}'::text[]`),
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot>().notNull(),
    contactPhone: varchar("contact_phone", { length: 16 }).notNull(),
    contactEmail: varchar("contact_email", { length: 254 }),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    checkoutSessionId: uuid("checkout_session_id"),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    /** Server-computed: placed_at + cancellation window. Customers cannot cancel after this. */
    cancelDeadlineAt: timestamp("cancel_deadline_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Server-computed on delivery: delivered_at + return window. */
    returnDeadlineAt: timestamp("return_deadline_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    /** Payment attempt expiry for prepaid orders awaiting gateway confirmation. */
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_uq").on(t.orderNumber),
    uniqueIndex("orders_user_idempotency_uq").on(t.userId, t.idempotencyKey),
    index("orders_user_idx").on(t.userId, t.placedAt),
    index("orders_status_idx").on(t.status, t.placedAt),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_placed_idx").on(t.placedAt),
    check(
      "orders_total_ck",
      sql`${t.totalPaise} = ${t.subtotalPaise} - ${t.discountPaise} + ${t.shippingPaise} + ${t.codFeePaise} and ${t.totalPaise} >= 0`,
    ),
  ],
);

/** Line items carry a full price snapshot; catalog edits never rewrite history. */
export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    sku: varchar("sku", { length: 64 }).notNull(),
    productName: varchar("product_name", { length: 200 }).notNull(),
    size: varchar("size", { length: 16 }).notNull(),
    imageUrl: text("image_url"),
    unitMrpPaise: integer("unit_mrp_paise").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    quantity: integer("quantity").notNull(),
    lineSubtotalPaise: integer("line_subtotal_paise").notNull(),
    /** Share of order-level coupon discount allocated to this line (used for refunds). */
    discountPaise: integer("discount_paise").notNull().default(0),
    lineTotalPaise: integer("line_total_paise").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_qty_ck", sql`${t.quantity} > 0`),
    check("order_items_total_ck", sql`${t.lineTotalPaise} = ${t.lineSubtotalPaise} - ${t.discountPaise}`),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)],
);

export const orderNotes = pgTable(
  "order_notes",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("order_notes_order_idx").on(t.orderId)],
);

/* ──────────────────────────────── Payments ──────────────────────────────── */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    providerPaymentId: varchar("provider_payment_id", { length: 128 }),
    amountPaise: integer("amount_paise").notNull(),
    status: paymentStatusEnum("status").notNull(),
    failureReason: text("failure_reason"),
    /** A second successful capture for an already-paid order; auto-refunded. */
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    uniqueIndex("payments_provider_order_uq")
      .on(t.provider, t.providerOrderId)
      .where(sql`${t.providerOrderId} is not null`),
    uniqueIndex("payments_provider_payment_uq")
      .on(t.provider, t.providerPaymentId)
      .where(sql`${t.providerPaymentId} is not null`),
  ],
);

/** Raw gateway events. The unique key makes webhook processing idempotent. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: id(),
    paymentId: uuid("payment_id").references(() => payments.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_events_provider_event_uq").on(t.provider, t.providerEventId)],
);

/* ──────────────────────────────── Shipping ──────────────────────────────── */

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerShipmentId: varchar("provider_shipment_id", { length: 128 }),
    awb: varchar("awb", { length: 64 }),
    courierName: varchar("courier_name", { length: 80 }),
    trackingUrl: text("tracking_url"),
    labelUrl: text("label_url"),
    status: shipmentStatusEnum("status").notNull().default("CREATED"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("shipments_order_idx").on(t.orderId),
    uniqueIndex("shipments_awb_uq").on(t.awb).where(sql`${t.awb} is not null`),
  ],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: id(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: shipmentStatusEnum("status").notNull(),
    description: text("description"),
    location: varchar("location", { length: 120 }),
    providerEventId: varchar("provider_event_id", { length: 128 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("shipment_events_shipment_idx").on(t.shipmentId, t.occurredAt),
    uniqueIndex("shipment_events_provider_uq")
      .on(t.shipmentId, t.providerEventId)
      .where(sql`${t.providerEventId} is not null`),
  ],
);
