import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  ADDRESS_TYPES,
  CHECKOUT_STATUSES,
  COUPON_TYPES,
  INVENTORY_TXN_TYPES,
  MESSAGE_DIRECTIONS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RECOVERY_STATUSES,
  REFUND_METHODS,
  REFUND_STATUSES,
  RETURN_STATUSES,
  RETURN_TYPES,
  SHIPMENT_STATUSES,
} from "../../contracts/enums";

export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const returnTypeEnum = pgEnum("return_type", RETURN_TYPES);
export const returnStatusEnum = pgEnum("return_status", RETURN_STATUSES);
export const refundStatusEnum = pgEnum("refund_status", REFUND_STATUSES);
export const refundMethodEnum = pgEnum("refund_method", REFUND_METHODS);
export const inventoryTxnTypeEnum = pgEnum("inventory_txn_type", INVENTORY_TXN_TYPES);
export const couponTypeEnum = pgEnum("coupon_type", COUPON_TYPES);
export const checkoutStatusEnum = pgEnum("checkout_status", CHECKOUT_STATUSES);
export const recoveryStatusEnum = pgEnum("recovery_status", RECOVERY_STATUSES);
export const shipmentStatusEnum = pgEnum("shipment_status", SHIPMENT_STATUSES);
export const addressTypeEnum = pgEnum("address_type", ADDRESS_TYPES);
export const notificationChannelEnum = pgEnum("notification_channel", NOTIFICATION_CHANNELS);
export const notificationStatusEnum = pgEnum("notification_status", NOTIFICATION_STATUSES);
export const messageDirectionEnum = pgEnum("message_direction", MESSAGE_DIRECTIONS);
export const sessionSubjectEnum = pgEnum("session_subject", ["CUSTOMER", "ADMIN"]);
export const actorTypeEnum = pgEnum("actor_type", ["CUSTOMER", "ADMIN", "SYSTEM"]);

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const deletedAt = () => timestamp("deleted_at", { withTimezone: true });
