/**
 * Canonical domain enumerations.
 *
 * This module is the single source of truth for every lifecycle state in the
 * platform. The database enums, the API contracts, the state machines and the
 * frontend all import from here — never redeclare these literals elsewhere.
 *
 * Pure module: must only depend on nothing (safe for browser bundles).
 */

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PENDING_COD_APPROVAL",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "PAYMENT_INITIATED",
  "PAYMENT_PENDING",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["PREPAID", "COD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RETURN_TYPES = ["RETURN", "EXCHANGE", "REFUND"] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_STATUSES = [
  "REQUESTED",
  "INFO_REQUESTED",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "REFUND_INITIATED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const REFUND_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_METHODS = ["ORIGINAL_PAYMENT", "BANK_TRANSFER", "UPI"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const INVENTORY_TXN_TYPES = [
  "STOCK_IN",
  "ORDER_RESERVED",
  "ORDER_CONFIRMED",
  "ORDER_CANCELLED",
  "RETURN_RECEIVED",
  "MANUAL_ADJUSTMENT",
  "STOCK_CORRECTION",
] as const;
export type InventoryTxnType = (typeof INVENTORY_TXN_TYPES)[number];

/** Derived from is_active and deleted_at: DRAFT = hidden, ARCHIVED = retired but kept for order history. */
export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** OUT: nothing sellable; LOW: some size at/below its threshold or sold out; IN: healthy. */
export const STOCK_STATES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export const COUPON_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const CHECKOUT_STATUSES = ["ACTIVE", "ABANDONED", "CONVERTED", "EXPIRED"] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export const RECOVERY_STATUSES = ["NOT_CONTACTED", "QUEUED", "CONTACTED", "RECOVERED", "OPTED_OUT"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  "CREATED",
  "LABEL_GENERATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "RTO",
  "CANCELLED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const ADDRESS_TYPES = ["HOME", "WORK", "OTHER"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["PENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_TOPICS = [
  "OTP",
  "ORDER_PLACED",
  "ORDER_CONFIRMED",
  "COD_APPROVED",
  "COD_REJECTED",
  "ORDER_CANCELLED",
  "SHIPPING_UPDATE",
  "DELIVERY_UPDATE",
  "RETURN_UPDATE",
  "REFUND_UPDATE",
  "ABANDONED_CHECKOUT",
  "CUSTOMER_SUPPORT",
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const MESSAGE_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const CUSTOMER_EVENT_TYPES = [
  "PAGE_VIEW",
  "PRODUCT_VIEW",
  "SEARCH",
  "ADD_TO_CART",
  "REMOVE_FROM_CART",
  "CHECKOUT_STARTED",
  "ADDRESS_ADDED",
  "PAYMENT_STARTED",
  "PAYMENT_FAILED",
  "PAYMENT_SUCCESS",
  "ORDER_CREATED",
  "ORDER_CANCELLED",
  "ORDER_DELIVERED",
  "RETURN_REQUESTED",
  "CHECKOUT_ABANDONED",
  "SIGNED_IN",
] as const;
export type CustomerEventType = (typeof CUSTOMER_EVENT_TYPES)[number];

/** Events the browser is allowed to report. Everything else is recorded server-side. */
export const CLIENT_REPORTABLE_EVENTS = ["PAGE_VIEW", "PRODUCT_VIEW", "SEARCH"] as const satisfies readonly CustomerEventType[];

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "ORDER_MANAGER", "INVENTORY_MANAGER", "SUPPORT"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "orders.approve_cod",
  "orders.cancel_override",
  "customers.view",
  "customers.manage",
  "products.view",
  "products.manage",
  "inventory.view",
  "inventory.manage",
  "coupons.view",
  "coupons.manage",
  "returns.view",
  "returns.manage",
  "refunds.approve",
  "whatsapp.view",
  "whatsapp.reply",
  "analytics.view",
  "settings.manage",
  "audit.view",
  "admins.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PRODUCT_SORTS = ["featured", "newest", "best-selling", "price-low", "price-high", "discount", "name"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
