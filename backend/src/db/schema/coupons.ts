import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { couponTypeEnum, createdAt, id, updatedAt } from "./_shared";
import { categories, products } from "./catalog";
import { users } from "./identity";

export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    /** Stored upper-case; lookups are case-insensitive. */
    code: varchar("code", { length: 32 }).notNull(),
    description: text("description"),
    type: couponTypeEnum("type").notNull(),
    /** PERCENTAGE: whole percent (1–90). FIXED_AMOUNT: paise. */
    value: integer("value").notNull(),
    minOrderPaise: integer("min_order_paise").notNull().default(0),
    maxDiscountPaise: integer("max_discount_paise"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit"),
    isActive: boolean("is_active").notNull().default(true),
    newCustomersOnly: boolean("new_customers_only").notNull().default(false),
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    isStackable: boolean("is_stackable").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("coupons_code_uq").on(sql`upper(${t.code})`),
    check("coupons_value_ck", sql`${t.value} > 0 and (${t.type} <> 'PERCENTAGE' or ${t.value} <= 90)`),
    check("coupons_usage_ck", sql`${t.usageLimit} is null or ${t.usedCount} <= ${t.usageLimit}`),
  ],
);

/** Restrict a coupon to products. No rows = no product restriction. */
export const couponProducts = pgTable(
  "coupon_products",
  {
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.productId] })],
);

/** Restrict a coupon to categories. No rows = no category restriction. */
export const couponCategories = pgTable(
  "coupon_categories",
  {
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.categoryId] })],
);

/** One row per coupon redemption. Deleted when the order is cancelled/rejected. */
export const couponUsage = pgTable(
  "coupon_usage",
  {
    id: id(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orderId: uuid("order_id").notNull(),
    discountPaise: integer("discount_paise").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("coupon_usage_order_coupon_uq").on(t.orderId, t.couponId),
    index("coupon_usage_coupon_user_idx").on(t.couponId, t.userId),
  ],
);
