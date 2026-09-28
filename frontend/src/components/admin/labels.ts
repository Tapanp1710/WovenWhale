import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type AdminRole,
  type AdminSessionDTO,
  type OrderStatus,
  type PaymentStatus,
  type Permission,
  type RefundStatus,
  type ReturnStatus,
} from "@wovenwhale/backend/contracts";

/** True when the admin holds at least one of the permissions. */
export const can = (admin: Pick<AdminSessionDTO, "permissions"> | null | undefined, ...perms: Permission[]) =>
  Boolean(admin && perms.some((p) => admin.permissions.includes(p)));

/** "PAYMENT_SUCCESS" → "Payment success"; for enums without a dedicated label map. */
export const humanize = (value: string) => {
  const s = value.replace(/[._]/g, " ").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Operators need the internal meaning of two customer-facing labels. */
export const ORDER_STATUS_ADMIN_LABELS: Record<OrderStatus, string> = {
  ...ORDER_STATUS_LABELS,
  PENDING_COD_APPROVAL: "COD pending approval",
  REJECTED: "Rejected",
};

export const PAYMENT_STATUS_ADMIN_LABELS: Record<PaymentStatus, string> = PAYMENT_STATUS_LABELS;

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "attention";

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "neutral",
  PENDING_COD_APPROVAL: "attention",
  CONFIRMED: "info",
  PROCESSING: "info",
  PACKED: "info",
  SHIPPED: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PAYMENT_INITIATED: "neutral",
  PAYMENT_PENDING: "warning",
  PAYMENT_SUCCESS: "success",
  PAYMENT_FAILED: "danger",
  PAYMENT_REFUNDED: "neutral",
  PAYMENT_PARTIALLY_REFUNDED: "neutral",
};

export const RETURN_STATUS_TONE: Record<ReturnStatus, Tone> = {
  REQUESTED: "attention",
  INFO_REQUESTED: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  RECEIVED: "info",
  REFUND_INITIATED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export const REFUND_STATUS_TONE: Record<RefundStatus, Tone> = {
  PENDING: "warning",
  PROCESSING: "info",
  PROCESSED: "success",
  FAILED: "danger",
};

export const RISK_FLAG_LABELS: Record<string, string> = {
  FIRST_ORDER: "First order",
  PRIOR_CANCELLATIONS: "Prior cancellations",
  HIGH_VALUE: "High value",
  BULK_QUANTITY: "Bulk quantity",
  DIFFERENT_RECIPIENT_PHONE: "Different recipient phone",
};
export const riskLabel = (flag: string) => RISK_FLAG_LABELS[flag] ?? humanize(flag);

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  ORDER_MANAGER: "Order manager",
  INVENTORY_MANAGER: "Inventory manager",
  SUPPORT: "Support",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "View dashboard",
  "orders.view": "View orders",
  "orders.manage": "Update and ship orders",
  "orders.approve_cod": "Approve or reject COD",
  "orders.cancel_override": "Cancel any order",
  "customers.view": "View customers",
  "customers.manage": "Edit and block customers",
  "products.view": "View products",
  "products.manage": "Edit products",
  "inventory.view": "View stock",
  "inventory.manage": "Adjust stock",
  "coupons.view": "View coupons",
  "coupons.manage": "Edit coupons",
  "returns.view": "View returns",
  "returns.manage": "Process returns",
  "refunds.approve": "Approve refunds",
  "whatsapp.view": "View WhatsApp",
  "whatsapp.reply": "Reply on WhatsApp",
  "analytics.view": "View analytics",
  "settings.manage": "Manage store settings",
  "audit.view": "View audit log",
  "admins.manage": "Manage admins and roles",
};

export const percent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;
export const count = (n: number) => n.toLocaleString("en-IN");
