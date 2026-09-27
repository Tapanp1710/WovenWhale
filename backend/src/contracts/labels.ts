import type { OrderStatus, PaymentStatus, ReturnStatus, ReturnType } from "./enums";

/** Customer-facing copy for lifecycle states. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PENDING_COD_APPROVAL: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Not accepted",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAYMENT_INITIATED: "Initiated",
  PAYMENT_PENDING: "Pending",
  PAYMENT_SUCCESS: "Paid",
  PAYMENT_FAILED: "Failed",
  PAYMENT_REFUNDED: "Refunded",
  PAYMENT_PARTIALLY_REFUNDED: "Partially refunded",
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Requested",
  INFO_REQUESTED: "Information needed",
  APPROVED: "Approved",
  REJECTED: "Declined",
  RECEIVED: "Item received",
  REFUND_INITIATED: "Refund initiated",
  COMPLETED: "Completed",
  CANCELLED: "Withdrawn",
};

export const RETURN_TYPE_LABELS: Record<ReturnType, string> = {
  RETURN: "Return",
  EXCHANGE: "Exchange",
  REFUND: "Refund",
};

/** The customer-visible progression used by order timelines. */
export const ORDER_PROGRESS: readonly OrderStatus[] = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
