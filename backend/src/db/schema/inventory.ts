import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, inventoryTxnTypeEnum } from "./_shared";
import { productVariants } from "./catalog";
import { adminUsers } from "./identity";

/**
 * Variant-level stock ledger head.
 *   available = on_hand - reserved
 * Check constraints make overselling impossible even under concurrent writers.
 */
export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("inventory_non_negative_ck", sql`${t.onHand} >= 0 and ${t.reserved} >= 0`),
    check("inventory_reserved_le_on_hand_ck", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

/** Append-only movement journal. Every stock change writes exactly one row. */
export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: id(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    type: inventoryTxnTypeEnum("type").notNull(),
    onHandDelta: integer("on_hand_delta").notNull(),
    reservedDelta: integer("reserved_delta").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    orderId: uuid("order_id"),
    returnId: uuid("return_id"),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_txn_variant_idx").on(t.variantId, t.createdAt),
    index("inventory_txn_order_idx").on(t.orderId),
  ],
);
