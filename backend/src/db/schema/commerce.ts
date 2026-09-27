import { sql } from "drizzle-orm";
import {
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
import { checkoutStatusEnum, createdAt, id, recoveryStatusEnum, updatedAt } from "./_shared";
import { productVariants, products } from "./catalog";
import { users } from "./identity";

/**
 * Persistent carts. A guest cart is identified by a hashed cookie token; on
 * sign-in it is merged into the customer's cart. Prices are never stored here —
 * totals are always recomputed server-side from the catalog.
 */
export const carts = pgTable(
  "carts",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestTokenHash: varchar("guest_token_hash", { length: 64 }),
    couponCodes: text("coupon_codes").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("carts_user_uq").on(t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("carts_guest_uq").on(t.guestTokenHash).where(sql`${t.guestTokenHash} is not null`),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_variant_uq").on(t.cartId, t.variantId),
    check("cart_items_qty_ck", sql`${t.quantity} between 1 and 10`),
  ],
);

export interface CheckoutSnapshotLine {
  variantId: string;
  productId: string;
  name: string;
  size: string;
  quantity: number;
  unitPricePaise: number;
}

/** Tracks each checkout attempt for funnel analytics and abandoned-checkout recovery. */
export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cartId: uuid("cart_id").references(() => carts.id, { onDelete: "set null" }),
    status: checkoutStatusEnum("status").notNull().default("ACTIVE"),
    step: varchar("step", { length: 24 }).notNull().default("ADDRESS"),
    cartSnapshot: jsonb("cart_snapshot").$type<CheckoutSnapshotLine[]>().notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    recoveryStatus: recoveryStatusEnum("recovery_status").notNull().default("NOT_CONTACTED"),
    convertedOrderId: uuid("converted_order_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("checkout_sessions_status_activity_idx").on(t.status, t.lastActivityAt),
    index("checkout_sessions_user_idx").on(t.userId, t.createdAt),
  ],
);

export const wishlists = pgTable(
  "wishlists",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wishlists_user_uq").on(t.userId)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: id(),
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wishlist_items_uq").on(t.wishlistId, t.productId)],
);
