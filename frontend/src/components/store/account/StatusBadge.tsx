import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  RETURN_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
  type ReturnStatus,
} from "@wovenwhale/backend/contracts";
import styles from "./StatusBadge.module.css";

type Tone = "neutral" | "progress" | "attention" | "success" | "danger";

const ORDER_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "attention",
  PENDING_COD_APPROVAL: "attention",
  CONFIRMED: "progress",
  PROCESSING: "progress",
  PACKED: "progress",
  SHIPPED: "progress",
  OUT_FOR_DELIVERY: "progress",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
};

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  PAYMENT_INITIATED: "neutral",
  PAYMENT_PENDING: "attention",
  PAYMENT_SUCCESS: "success",
  PAYMENT_FAILED: "danger",
  PAYMENT_REFUNDED: "neutral",
  PAYMENT_PARTIALLY_REFUNDED: "neutral",
};

const RETURN_TONE: Record<ReturnStatus, Tone> = {
  REQUESTED: "attention",
  INFO_REQUESTED: "attention",
  APPROVED: "progress",
  REJECTED: "danger",
  RECEIVED: "progress",
  REFUND_INITIATED: "progress",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`${styles.badge} ${styles[ORDER_TONE[status]]}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`${styles.badge} ${styles[PAYMENT_TONE[status]]}`}>{PAYMENT_STATUS_LABELS[status]}</span>;
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <span className={`${styles.badge} ${styles[RETURN_TONE[status]]}`}>{RETURN_STATUS_LABELS[status]}</span>;
}
