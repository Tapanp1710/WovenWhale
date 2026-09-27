import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import {
  createdAt,
  id,
  refundMethodEnum,
  refundStatusEnum,
  returnStatusEnum,
  returnTypeEnum,
  updatedAt,
} from "./_shared";
import { productVariants } from "./catalog";
import { adminUsers, users } from "./identity";
import { orderItems, orders, payments } from "./orders";

export const returns = pgTable(
  "returns",
  {
    id: id(),
    returnNumber: varchar("return_number", { length: 24 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: returnTypeEnum("type").notNull(),
    status: returnStatusEnum("status").notNull().default("REQUESTED"),
    reason: varchar("reason", { length: 64 }).notNull(),
    customerNote: text("customer_note"),
    /** Question sent to the customer when status is INFO_REQUESTED. */
    infoRequest: text("info_request"),
    adminNote: text("admin_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("returns_number_uq").on(t.returnNumber),
    index("returns_order_idx").on(t.orderId),
    index("returns_status_idx").on(t.status, t.createdAt),
  ],
);

export const returnItems = pgTable(
  "return_items",
  {
    id: id(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    quantity: integer("quantity").notNull(),
    /** EXCHANGE only: the replacement variant (e.g. a different size). */
    exchangeVariantId: uuid("exchange_variant_id").references(() => productVariants.id),
    restock: boolean("restock").notNull().default(true),
  },
  (t) => [index("return_items_return_idx").on(t.returnId), check("return_items_qty_ck", sql`${t.quantity} > 0`)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    returnId: uuid("return_id").references(() => returns.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    amountPaise: integer("amount_paise").notNull(),
    method: refundMethodEnum("method").notNull(),
    status: refundStatusEnum("status").notNull().default("PENDING"),
    providerRefundId: varchar("provider_refund_id", { length: 128 }),
    reason: text("reason").notNull(),
    approvedByAdminId: uuid("approved_by_admin_id").references(() => adminUsers.id),
    failureReason: text("failure_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("refunds_order_idx").on(t.orderId),
    index("refunds_status_idx").on(t.status),
    uniqueIndex("refunds_provider_uq").on(t.providerRefundId).where(sql`${t.providerRefundId} is not null`),
    check("refunds_amount_ck", sql`${t.amountPaise} > 0`),
  ],
);
